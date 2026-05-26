package httpWriter

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

type NamespaceKey struct{}

func RespondWithJSON(w http.ResponseWriter, statusCode int, payload interface{}) {
	data, err := json.Marshal(payload)

	if err != nil {
		slog.Info(
			"Unable to marshal JSON",
			"Payload", payload,
			"ERROR", err,
		)
		w.WriteHeader(500)
		return
	}

	w.Header().Add("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_, writeErr := w.Write(data)

	if writeErr != nil {
		slog.Info(
			"Unable to write data",
			"ERROR", writeErr,
		)
		return
	}

}

func RespondWithError(w http.ResponseWriter, statusCode int, msg string) {
	if statusCode > 499 {
		slog.Info(
			"Server Side Error",
			"ERROR", msg,
		)
	}

	type errResponse struct {
		Error string
	}

	RespondWithJSON(w, statusCode, errResponse{
		Error: msg,
	})
}
