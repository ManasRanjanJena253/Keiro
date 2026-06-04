package api

import (
	"Keiro/gateway/httpWriter"
	"Keiro/gateway/metrics"
	"Keiro/gateway/queue"
	pb "Keiro/generated/go/proto"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"strconv"
)

func (ingester *IngestHandler) IngestUserDoc(w http.ResponseWriter, r *http.Request) {
	file, header, err := r.FormFile("file")
	if err != nil {
		slog.Error("Unable to get the file", "ERROR", err)
		httpWriter.RespondWithError(w, 400, "Uploaded file is malformed")
		return
	}
	defer func(file multipart.File) {
		err := file.Close()
		if err != nil {
			slog.Error("Unable to close file", "ERROR", err)
			httpWriter.RespondWithError(w, 500, "Unable to process file. Plz try again later")
			return
		}
	}(file)

	fileSize := header.Size
	if header.Size > int64(ingester.maxSize)*1024*1024 {
		slog.Error("File size too large", "File Size", fileSize)
		httpWriter.RespondWithError(w, 413, "File size too large")
		return
	}

	mimeType := header.Header.Get("Content-Type")
	if mimeType != "application/pdf" && mimeType != "text/plain" {
		slog.Error("Unsupported file type", "File Type", mimeType)
		httpWriter.RespondWithError(w, 400, "Unsupported File Type. File should either be pdf or text")
		return
	}

	contentBytes, err := io.ReadAll(file)
	if err != nil {
		slog.Error("Couldn't read file content", "ERROR", err)
		httpWriter.RespondWithError(w, 500, "Unable to read file content")
		return
	}

	id, err := ingester.tracker.CreateJob()
	if err != nil {
		response := docHandlerResponse{
			JobId:     id,
			JobStatus: queue.Failed,
			Error:     err.Error(),
		}
		httpWriter.RespondWithJSON(w, 500, response)
		return
	}
	val := r.FormValue("chunking_strategy")
	chunkingStrat, err := strconv.Atoi(val)
	if err != nil {
		slog.Error("Wrong chunking strategy received", "Chunking Strat", val, "ERROR", err)
		httpWriter.RespondWithError(w, 400, "Plz select correct chunking strategy")
		return
	}
	ctx := r.Context()
	namespace := ctx.Value(httpWriter.NamespaceKey{})
	fileName := header.Filename
	fileDetails := pb.IngestDocumentRequest{
		DocContent:       contentBytes,
		Namespace:        namespace.(string),
		Filename:         fileName,
		MimeType:         mimeType,
		ChunkingStrategy: pb.ChunkingStrategy(chunkingStrat),
	}

	err = ingester.ingestion.Enqueue(id, &fileDetails)
	if err != nil {
		slog.Error("Unable to enqueue the job", "File ID", id, "ERROR", err)
		response := docHandlerResponse{
			JobId:     id,
			JobStatus: queue.Failed,
			Error:     err.Error(),
		}
		httpWriter.RespondWithJSON(w, 500, response)
		return
	}
	response := docHandlerResponse{
		JobId:     id,
		JobStatus: queue.Pending,
		Error:     "",
	}

	metrics.IngestionThroughput.WithLabelValues(namespace.(string)).Inc()
	httpWriter.RespondWithJSON(w, 200, response)
}
