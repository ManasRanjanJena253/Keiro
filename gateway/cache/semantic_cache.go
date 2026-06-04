package cache

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"math"
	"strings"
	"sync/atomic"
)

type SemanticCache struct {
	embedCache   *EmbeddingCache
	cacheStore   *LRUStore
	simThreshold float32
	hits         int64
	misses       int64
}

func CalcCosineSim(queryEmbed, cacheEmbed []float32) (float32, error) {
	if len(queryEmbed) != len(cacheEmbed) {
		return 0, errors.New("length mismatch")
	}
	var querySum, cacheSum float32

	var dotProd float32 = 0
	for i := 0; i < len(queryEmbed); i++ {
		dotProd += queryEmbed[i] * cacheEmbed[i]
		querySum += queryEmbed[i] * queryEmbed[i]
		cacheSum += cacheEmbed[i] * cacheEmbed[i]
	}

	queryMag, cacheMag := math.Sqrt(float64(querySum)), math.Sqrt(float64(cacheSum))

	cosSim := dotProd / float32((queryMag * cacheMag))
	return cosSim, nil
}

func NewSemanticCache(store *LRUStore, embedCache *EmbeddingCache, threshold float32) *SemanticCache {
	return &SemanticCache{
		embedCache:   embedCache,
		cacheStore:   store,
		simThreshold: threshold,
	}
}

func (semCache *SemanticCache) Set(namespace, query string, embedding []float32, response any) {
	hashSum := sha256.Sum256([]byte(query))
	encodedQuery := hex.EncodeToString(hashSum[:])
	key := namespace + ":" + encodedQuery
	semCache.cacheStore.Set(key, response)
	semCache.embedCache.Set(key, embedding)
}

func (semCache *SemanticCache) Get(namespace string, embedding []float32) (string, bool) {
	keys := semCache.embedCache.GetKeys()
	response := ""
	var maxSim float32 = -1.0

	for _, key := range keys {
		if !strings.HasPrefix(key, namespace+":") {
			continue
		}
		vec, ok := semCache.embedCache.Get(key)
		if !ok {
			continue
		}
		cosSim, err := CalcCosineSim(embedding, vec)
		if err != nil {
			slog.Error("cosine similarity failed", "ERROR", err)
			continue
		}
		if cosSim > semCache.simThreshold && cosSim > maxSim {
			val, ok := semCache.cacheStore.Get(key)
			if !ok {
				continue
			}
			maxSim = cosSim
			response, ok = val.(string)
			if !ok {
				continue
			}
		}
	}
	if maxSim == -1 {
		atomic.AddInt64(&semCache.misses, 1)
		return "", false
	}
	atomic.AddInt64(&semCache.hits, 1)
	return response, true
}

func (semCache *SemanticCache) Size() int {
	return semCache.embedCache.lruStore.Len()
}

func (semCache *SemanticCache) HitRate() float64 {
	h := atomic.LoadInt64(&semCache.hits)
	m := atomic.LoadInt64(&semCache.misses)
	if h+m == 0 {
		return 0
	}
	return float64(h) / float64(h+m)
}
