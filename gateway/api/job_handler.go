package api

import "net/http"

func JobHandler(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, 501, struct{}{})
}
