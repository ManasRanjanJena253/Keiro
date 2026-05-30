package api

import (
	"Keiro/gateway/httpWriter"
	"Keiro/gateway/intelligence"
	"encoding/json"
	"log/slog"
	"net/http"
)

func (qHandler *QueryHandler) HandleUserQuery(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	namespace := ctx.Value(httpWriter.NamespaceKey{})
	if err := json.NewDecoder(r.Body).Decode(&queryReq); err != nil {
		httpWriter.RespondWithError(w, 400, "Invalid request body")
		return
	}

	query := queryReq.Query

	queryEmbed, err := intelligence.ComputeEmbeddings(qHandler.intelClient, query)

	if err != nil {
		httpWriter.RespondWithError(w, 502, "Unable to connect with the gateway")
		slog.Error("Unable to calc embeddings", "ERROR", err)
		return
	}

	response, ok := qHandler.semCache.Get(namespace.(string), queryEmbed)
	if !ok { // cache miss
		queryDetails, err := intelligence.ClassifyQuery(qHandler.intelClient, query, namespace.(string))
		if err != nil {
			httpWriter.RespondWithError(w, 502, "Unable to connect with gateway")
			slog.Error("Unable to reach ClassifyQuery", "ERROR", err)
			return
		}
		queryConfig := queryDetails.Config

		retrieval, err := intelligence.ExecuteRetrieval(qHandler.intelClient, query, queryConfig, namespace.(string))
		if err != nil {
			httpWriter.RespondWithError(w, 502, "Unable to connect with gateway")
			slog.Error("Unable to reach Retrieve data", "ERROR", err)
			return
		}

		if !retrieval.RetrievalStatus {
			slog.Info(
				"No retrieval took place",
				"Retrieval Status", retrieval.RetrievalStatus)
		}
		retrievedChunks := retrieval.RetrievedChunk

		finalResponse, err := intelligence.GenerateResponse(qHandler.intelClient, namespace.(string), query, retrievedChunks)

		if err != nil {
			httpWriter.RespondWithError(w, 502, "Unable to connect with gateway")
			slog.Error("Unable to fetch Response", "ERROR", err)
			return
		}

		qHandler.semCache.Set(namespace.(string), query, queryEmbed, finalResponse.Response)

		httpWriter.RespondWithJSON(w, 200, queryResponseStruct{
			Response:         finalResponse.Response,
			PromptTokens:     finalResponse.PromptTokens,
			CompletionToken:  finalResponse.CompletionTokens,
			ResponseModel:    finalResponse.Model,
			CacheHit:         false,
			RetrievalDetails: queryConfig,
		})

		return
	}

	httpWriter.RespondWithJSON(w, 200, queryResponseStruct{
		Response:         response,
		PromptTokens:     0,
		CompletionToken:  0,
		ResponseModel:    "",
		CacheHit:         true,
		RetrievalDetails: nil,
	})
}
