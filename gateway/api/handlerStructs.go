package api

import (
	"Keiro/gateway/cache"
	"Keiro/gateway/queue"
	pb "Keiro/generated/go/proto"

	"github.com/google/uuid"
)

type queryResponseStruct struct {
	Response         string              `json:"response"`
	PromptTokens     int32               `json:"prompt_tokens"`
	CompletionToken  int32               `json:"completion_token"`
	ResponseModel    string              `json:"response_model"`
	CacheHit         bool                `json:"cache_hit"`
	RetrievalDetails *pb.RetrievalConfig `json:"retrieval_details"`
}

type docHandlerResponse struct {
	JobId     uuid.UUID    `json:"job_id"`
	JobStatus queue.Status `json:"job_status"`
	Error     string       `json:"error"`
}

var queryReq struct {
	Query string `json:"query"`
}

type QueryHandler struct {
	intelClient pb.IntelligenceServiceClient
	semCache    *cache.SemanticCache
}

type IngestHandler struct {
	tracker   *queue.JobTracker
	ingestion *queue.IngestionQueue
	maxSize   int32
}

type JobHandler struct {
	tracker *queue.JobTracker
}

func NewQueryHandler(client pb.IntelligenceServiceClient, ttl, capacity int, simThreshold float32) *QueryHandler {
	cacheStore := cache.NewLRU(capacity, ttl)
	embedCache := cache.NewEmbeddingCache(cacheStore)
	semCache := cache.NewSemanticCache(cacheStore, embedCache, simThreshold)
	return &QueryHandler{
		intelClient: client,
		semCache:    semCache,
	}
}

func NewIngestHandler(maxFileSize int32, ingestion *queue.IngestionQueue, tracker *queue.JobTracker) *IngestHandler {
	return &IngestHandler{
		tracker:   tracker,
		ingestion: ingestion,
		maxSize:   maxFileSize,
	}
}

func NewJobHandler(tracker *queue.JobTracker) *JobHandler {
	return &JobHandler{tracker}
}
