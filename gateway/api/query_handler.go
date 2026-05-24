package api

import "net/http"

func HandleUserQuery(w http.ResponseWriter, r *http.Request) {
	RespondWithJSON(w, 501, struct{}{})
}
