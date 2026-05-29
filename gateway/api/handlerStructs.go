package api

import (
	"Keiro/gateway/cache"
	pb "Keiro/generated/go/proto"
)

type responseStruct struct {
	Response         string              `json:"response"`
	PromptTokens     int32               `json:"prompt_tokens"`
	CompletionToken  int32               `json:"completion_token"`
	ResponseModel    string              `json:"response_model"`
	CacheHit         bool                `json:"cache_hit"`
	RetrievalDetails *pb.RetrievalConfig `json:"retrieval_details"`
}

type QueryHandler struct {
	intelClient pb.IntelligenceServiceClient
	semCache    *cache.SemanticCache
}

var queryReq struct {
	Query string `json:"query"`
}

func NewQueryHandler(client pb.IntelligenceServiceClient, ttl, capacity int, simThreshold float32) (qHandler *QueryHandler) {
	cacheStore := cache.NewLRU(capacity, ttl)
	embedCache := cache.NewEmbeddingCache(cacheStore)
	semCache := cache.NewSemanticCache(cacheStore, embedCache, simThreshold)
	return &QueryHandler{
		intelClient: client,
		semCache:    semCache,
	}
}
