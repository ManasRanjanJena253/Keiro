package api

import "net/http"

func IngestHandler(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, 501, struct{}{})
}
