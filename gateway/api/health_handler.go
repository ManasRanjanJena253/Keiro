package api

import (
	"Keiro/gateway/httpWriter"
	"net/http"
)

func CheckHealth(w http.ResponseWriter, r *http.Request) {
	type HealthStatus struct {
		Status bool
	}
	httpWriter.RespondWithJSON(w, 200, HealthStatus{Status: true})
}
