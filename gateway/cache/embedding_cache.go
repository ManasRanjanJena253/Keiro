package cache

import (
	"crypto/sha256"
	"encoding/hex"
)

type EmbeddingCache struct {
	lruStore *LRUStore
}

func NewEmbeddingCache(store *LRUStore) *EmbeddingCache {
	return &EmbeddingCache{lruStore: store}
}

func (embedCache *EmbeddingCache) Set(query string, embeddings []float32) {
	hashedKey := sha256.Sum256([]byte(query))
	encodedKey := hex.EncodeToString(hashedKey[:])
	embedCache.lruStore.Set(encodedKey, embeddings)
}

func (embedCache *EmbeddingCache) Get(key string) ([]float32, bool) {
	hashedKey := sha256.Sum256([]byte(key))
	keyStr := hex.EncodeToString(hashedKey[:])

	val, ok := embedCache.lruStore.Get(keyStr)
	if !ok {
		return nil, false
	}

	vec, ok := val.([]float32)
	if !ok {
		return nil, false
	}
	return vec, true
}

func (embedCache *EmbeddingCache) GetKeys() []string {
	keys := []string{}

	for _, key := range embedCache.lruStore.cache.Keys() {
		keys = append(keys, key)
	}
	return keys
}
