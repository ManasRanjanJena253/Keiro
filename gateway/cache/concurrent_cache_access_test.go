package cache_test

import (
	"Keiro/gateway/cache"
	"fmt"
	"sync"
	"testing"
)

func TestConcurrentReadWrite(t *testing.T) {
	store := cache.NewLRU(100, 30)
	embedCache := cache.NewEmbeddingCache(store)
	semCache := cache.NewSemanticCache(store, embedCache, 0.92)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(2)
		go func(i int) {
			defer wg.Done()
			semCache.Set("ns1", fmt.Sprintf("query%d", i), make([]float32, 384), fmt.Sprintf("response%d", i))
		}(i)
		go func(i int) {
			defer wg.Done()
			semCache.Get("ns1", make([]float32, 384))
		}(i)
	}
	wg.Wait()
}

func TestNamespaceIsolationUnderConcurrency(t *testing.T) {
	store := cache.NewLRU(100, 30)
	embedCache := cache.NewEmbeddingCache(store)
	semCache := cache.NewSemanticCache(store, embedCache, 0.92)

	vec := make([]float32, 384)
	for i := range vec {
		vec[i] = 0.1
	}

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			semCache.Set("ns1", fmt.Sprintf("query%d", i), vec, fmt.Sprintf("ns1-response%d", i))
		}(i)
	}
	wg.Wait()

	response, ok := semCache.Get("ns2", vec)
	if ok && response != "" {
		t.Errorf("namespace leak: ns2 received ns1 response: %s", response)
	}
}
