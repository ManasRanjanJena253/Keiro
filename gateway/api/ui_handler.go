package api

import (
	"Keiro/gateway/cache"
	"Keiro/gateway/httpWriter"
	"Keiro/gateway/intelligence"
	"Keiro/gateway/queue"
	pb "Keiro/generated/go/proto"
	"context"
	"fmt"
	"html/template"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc"
)

type UIHandler struct {
	intelClient pb.IntelligenceServiceClient
	semCache    *cache.SemanticCache
	tracker     *queue.JobTracker
	ingestion   *queue.IngestionQueue
	maxSize     int
	templates   *template.Template
	chromaHost  string
	chromaPort  string
}

type baseData struct {
	ActivePage string
}

type queryPageData struct {
	ActivePage       string
	DefaultNamespace string
}

type queryResponseData struct {
	Response         string
	Tier             string
	CacheHit         bool
	Latency          string
	Model            string
	PromptTokens     int32
	CompletionTokens int32
	TopK             int32
	Rerank           bool
	Decompose        bool
}

type jobStatusData struct {
	JobID  string
	Status string
	Error  string
}

type healthStatusData struct {
	GatewayUp         bool
	GatewayLatency    string
	IntelUp           bool
	IntelLatency      string
	ChromaUp          bool
	ChromaLatency     string
	CacheSize         string
	CacheHitRate      string
	CacheHitRateStyle template.CSS
}

type ingestPageData struct {
	ActivePage string
	MaxSizeMB  int
}

func NewUIHandler(
	intelClient pb.IntelligenceServiceClient,
	semCache *cache.SemanticCache,
	tracker *queue.JobTracker,
	ingestion *queue.IngestionQueue,
	maxSize int,
	chromaHost string,
	chromaPort string,
) *UIHandler {
	tmplDir := "templates"
	tmpl := template.Must(template.New("").ParseGlob(filepath.Join(tmplDir, "*.html")))
	tmpl = template.Must(tmpl.ParseGlob(filepath.Join(tmplDir, "partials", "*.html")))

	return &UIHandler{
		intelClient: intelClient,
		semCache:    semCache,
		tracker:     tracker,
		ingestion:   ingestion,
		maxSize:     maxSize,
		templates:   tmpl,
		chromaHost:  chromaHost,
		chromaPort:  chromaPort,
	}
}

func (u *UIHandler) renderTemplate(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := u.templates.ExecuteTemplate(w, name, data); err != nil {
		slog.Error("Template render error", "template", name, "ERROR", err)
		http.Error(w, "Template error", http.StatusInternalServerError)
	}
}

func (u *UIHandler) renderErrorFragment(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<div class="card" style="border-color:var(--error);background:var(--error-light);">
		<p style="color:#dc2626;font-size:0.88rem;">&#9888; %s</p>
	</div>`, template.HTMLEscapeString(msg))
}

// GET /v1/ui/query
func (u *UIHandler) HandleQueryPage(w http.ResponseWriter, r *http.Request) {
	u.renderTemplate(w, "query.html", queryPageData{
		ActivePage:       "query",
		DefaultNamespace: "",
	})
}

// POST /v1/ui/query
func (u *UIHandler) HandleQuerySubmit(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		u.renderErrorFragment(w, "Invalid form data")
		return
	}

	query := strings.TrimSpace(r.FormValue("query"))
	namespace := strings.TrimSpace(r.FormValue("namespace"))

	if query == "" || namespace == "" {
		u.renderErrorFragment(w, "Query and namespace are required")
		return
	}

	start := time.Now()

	queryEmbed, err := intelligence.ComputeEmbeddings(u.intelClient, query)
	if err != nil {
		slog.Error("UI: ComputeEmbeddings failed", "ERROR", err)
		u.renderErrorFragment(w, "Failed to compute embeddings: "+err.Error())
		return
	}

	cachedResp, ok := u.semCache.Get(namespace, queryEmbed)
	if ok {
		latency := fmt.Sprintf("%dms", time.Since(start).Milliseconds())
		u.renderTemplate(w, "query_response.html", queryResponseData{
			Response: cachedResp,
			Tier:     "cached",
			CacheHit: true,
			Latency:  latency,
		})
		return
	}

	queryDetails, err := intelligence.ClassifyQuery(u.intelClient, query, namespace)
	if err != nil {
		slog.Error("UI: ClassifyQuery failed", "ERROR", err)
		u.renderErrorFragment(w, "Failed to classify query: "+err.Error())
		return
	}

	retrieval, err := intelligence.ExecuteRetrieval(u.intelClient, query, queryDetails.Config, namespace)
	if err != nil {
		slog.Error("UI: ExecuteRetrieval failed", "ERROR", err)
		u.renderErrorFragment(w, "Failed to execute retrieval: "+err.Error())
		return
	}

	finalResponse, err := intelligence.GenerateResponse(u.intelClient, namespace, query, retrieval.RetrievedChunk)
	if err != nil {
		slog.Error("UI: GenerateResponse failed", "ERROR", err)
		u.renderErrorFragment(w, "Failed to generate response: "+err.Error())
		return
	}

	latency := fmt.Sprintf("%dms", time.Since(start).Milliseconds())
	u.semCache.Set(namespace, query, queryEmbed, finalResponse.Response)

	tier := strings.ToLower(queryDetails.Config.RetrievalType.String())

	u.renderTemplate(w, "query_response.html", queryResponseData{
		Response:         finalResponse.Response,
		Tier:             tier,
		CacheHit:         false,
		Latency:          latency,
		Model:            finalResponse.Model,
		PromptTokens:     finalResponse.PromptTokens,
		CompletionTokens: finalResponse.CompletionTokens,
		TopK:             queryDetails.Config.TopK,
		Rerank:           queryDetails.Config.Rerank,
		Decompose:        queryDetails.Config.Decompose,
	})
}

// GET /v1/ui/ingest
func (u *UIHandler) HandleIngestPage(w http.ResponseWriter, r *http.Request) {
	u.renderTemplate(w, "ingest.html", ingestPageData{
		ActivePage: "ingest",
		MaxSizeMB:  u.maxSize,
	})
}

// POST /v1/ui/ingest
func (u *UIHandler) HandleIngestSubmit(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("file")
	if err != nil {
		slog.Error("UI: Unable to get file", "ERROR", err)
		u.renderJobStatus(w, "", "failed", "Unable to read uploaded file")
		return
	}
	defer func(file multipart.File) {
		_ = file.Close()
	}(file)

	if header.Size > int64(u.maxSize)*1024*1024 {
		u.renderJobStatus(w, "", "failed", "File too large")
		return
	}

	mimeType := header.Header.Get("Content-Type")
	if mimeType != "application/pdf" && mimeType != "text/plain" {
		u.renderJobStatus(w, "", "failed", "Unsupported file type. Use PDF or plain text.")
		return
	}

	content, err := io.ReadAll(file)
	if err != nil {
		u.renderJobStatus(w, "", "failed", "Failed to read file content")
		return
	}

	namespace := strings.TrimSpace(r.FormValue("namespace"))
	if namespace == "" {
		u.renderJobStatus(w, "", "failed", "Namespace is required")
		return
	}

	chunkingVal := r.FormValue("chunking_strategy")
	chunkingStrat, err := strconv.Atoi(chunkingVal)
	if err != nil {
		chunkingStrat = 0
	}

	jobID, err := u.tracker.CreateJob()
	if err != nil {
		u.renderJobStatus(w, "", "failed", "Failed to create job: "+err.Error())
		return
	}

	fileDetails := &pb.IngestDocumentRequest{
		DocContent:       content,
		Namespace:        namespace,
		Filename:         header.Filename,
		MimeType:         mimeType,
		ChunkingStrategy: pb.ChunkingStrategy(chunkingStrat),
	}

	if err := u.ingestion.Enqueue(jobID, fileDetails); err != nil {
		u.renderJobStatus(w, jobID.String(), "failed", "Failed to enqueue job: "+err.Error())
		return
	}

	u.renderJobStatus(w, jobID.String(), "pending", "")
}

// GET /v1/ui/jobs/{job_id}
func (u *UIHandler) HandleUIJobStatus(w http.ResponseWriter, r *http.Request) {
	jobIDStr := r.PathValue("job_id")
	if jobIDStr == "" {
		http.Error(w, "Job ID required", http.StatusBadRequest)
		return
	}

	jobID, err := uuid.Parse(jobIDStr)
	if err != nil {
		u.renderJobStatus(w, jobIDStr, "failed", "Invalid job ID format")
		return
	}

	job, err := u.tracker.GetJob(jobID)
	if err != nil {
		u.renderJobStatus(w, jobIDStr, "failed", "Job not found")
		return
	}

	statusStr := statusToString(job.GetStatus())
	u.renderJobStatus(w, jobIDStr, statusStr, job.GetJobError())
}

// GET /v1/ui/health
func (u *UIHandler) HandleHealthPage(w http.ResponseWriter, r *http.Request) {
	u.renderTemplate(w, "health.html", baseData{ActivePage: "health"})
}

// GET /v1/ui/health/status
func (u *UIHandler) HandleHealthStatus(w http.ResponseWriter, r *http.Request) {
	data := healthStatusData{}

	// Go gateway — always up if we're responding
	data.GatewayUp = true
	data.GatewayLatency = "< 1ms"

	// Python intelligence — ping via ComputeEmbeddings
	intelStart := time.Now()
	_, intelErr := u.intelClient.ComputeEmbeddings(
		context.Background(),
		&pb.ComputeEmbeddingRequest{UserQuery: "health"},
		grpc.WaitForReady(false),
	)
	data.IntelUp = intelErr == nil
	data.IntelLatency = fmt.Sprintf("%dms", time.Since(intelStart).Milliseconds())

	// ChromaDB — HTTP heartbeat
	chromaStart := time.Now()
	chromaURL := fmt.Sprintf("http://%s:%s/api/v1/heartbeat", u.chromaHost, u.chromaPort)
	chromaResp, chromaErr := (&http.Client{Timeout: 3 * time.Second}).Get(chromaURL)
	data.ChromaUp = chromaErr == nil && chromaResp != nil && chromaResp.StatusCode == http.StatusOK
	data.ChromaLatency = fmt.Sprintf("%dms", time.Since(chromaStart).Milliseconds())
	if chromaResp != nil {
		_ = chromaResp.Body.Close()
	}

	// Cache metrics
	data.CacheSize = fmt.Sprintf("%d entries", u.semCache.Size())
	hitRate := u.semCache.HitRate()
	data.CacheHitRate = fmt.Sprintf("%.1f%%", hitRate*100)
	data.CacheHitRateStyle = template.CSS(fmt.Sprintf("width:%.1f%%;", hitRate*100))

	u.renderTemplate(w, "health_status.html", data)
}

func (u *UIHandler) renderJobStatus(w http.ResponseWriter, jobID, status, errMsg string) {
	u.renderTemplate(w, "job_status.html", jobStatusData{
		JobID:  jobID,
		Status: status,
		Error:  errMsg,
	})
}

func statusToString(s queue.Status) string {
	switch s {
	case queue.Pending:
		return "pending"
	case queue.Processing:
		return "processing"
	case queue.Completed:
		return "complete"
	case queue.Failed:
		return "failed"
	default:
		return "pending"
	}
}

// StaticFileHandler serves files from the static directory
func StaticFileHandler() http.Handler {
	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "static"
	}
	return http.StripPrefix("/static/", http.FileServer(http.Dir(staticDir)))
}

// Ensure httpWriter import is used
var _ = httpWriter.NamespaceKey{}
