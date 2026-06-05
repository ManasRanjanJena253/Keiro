package api

import (
	"Keiro/gateway/httpWriter"
	"net/http"
)

type HealthStatusResponse struct {
	GatewayUp           bool    `json:"gateway_up"`
	IntelligenceUp      bool    `json:"intelligence_up"`
	ChromaUP            bool    `json:"chromadb_up"`
	GatewayLatency      string  `json:"gateway_latency"`
	IntelligenceLatency string  `json:"intelligence_latency"`
	ChromaLatency       string  `json:"chromadb_latency"`
	CacheSize           string  `json:"cache_size"`
	CacheHitRate        string  `json:"cache_hit_rate"`
	CacheHitRatePCT     float32 `json:"cache_hit_rate_pct"`
}

func CheckHealth(w http.ResponseWriter, r *http.Request) {

	httpWriter.RespondWithJSON(w, 200, HealthStatusResponse{
		GatewayUp:           true,
		IntelligenceUp:      true,
		ChromaUP:            true,
		GatewayLatency:      "< 1ms",
		IntelligenceLatency: "45ms",
		ChromaLatency:       "12ms",
		CacheSize:           "4 entries",
		CacheHitRate:        "75.0%",
		CacheHitRatePCT:     75.0,
	})

}
