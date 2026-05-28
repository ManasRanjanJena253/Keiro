package cache

import (
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
)

type LRUStore struct {
	ttl      int
	capacity int
	cache    *expirable.LRU[string, any]
}

func NewLRU(capacity, TTL int) *LRUStore {
	cache := expirable.NewLRU[string, any](capacity, nil, time.Duration(TTL)*time.Second)
	return &LRUStore{
		ttl:      TTL,
		capacity: capacity,
		cache:    cache,
	}
}

func (store *LRUStore) Set(key string, value any) {
	store.cache.Add(key, value)
}

func (store *LRUStore) Get(key string) (any, bool) {
	value, ok := store.cache.Get(key)

	if !ok {
		return nil, false
	}
	return value, true
}

func (store *LRUStore) Remove(key string) {
	store.cache.Remove(key)
}

func (store *LRUStore) Len() int {
	return store.cache.Len()
}
