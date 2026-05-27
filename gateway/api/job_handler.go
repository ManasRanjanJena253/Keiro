package api

import (
	"Keiro/gateway/httpWriter"
	"net/http"
)

func JobHandler(w http.ResponseWriter, r *http.Request) {
	httpWriter.RespondWithJSON(w, 501, struct{}{})
}
