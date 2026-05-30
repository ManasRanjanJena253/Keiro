package api

import (
	"Keiro/gateway/httpWriter"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (jobHandler *JobHandler) UserJobHandler(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "job_id")
	jobID, err := uuid.Parse(id)
	if err != nil {
		slog.Error("Not a valid job id", "ERROR", err)
		httpWriter.RespondWithError(w, 400, "Not a valid UUID")
		return
	}
	job, err := jobHandler.tracker.GetJob(jobID)
	if err != nil {
		slog.Error("Couldn't get status", "Job ID", jobID, "ERROR", err)
		httpWriter.RespondWithError(w, 404, "Job not found")
		return
	}
	response := docHandlerResponse{
		JobId:     jobID,
		JobStatus: job.GetStatus(),
		Error:     job.GetJobError(),
	}
	httpWriter.RespondWithJSON(w, 200, response)
}
