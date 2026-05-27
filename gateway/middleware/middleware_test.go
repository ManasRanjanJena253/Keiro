package middleware

import (
	"Keiro/gateway/config"
	"Keiro/gateway/httpWriter"
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
)

var dummyHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
})

func TestAuth(t *testing.T) {
	cfg := &config.Config{}
	cfg.Auth = "test-secret"

	tests := []struct {
		name            string
		secretHeader    string
		namespaceHeader string
		expectedStatus  int
	}{
		{
			name:            "valid secret and namespace",
			secretHeader:    "test-secret",
			namespaceHeader: "testnamespace",
			expectedStatus:  200,
		},
		{
			name:            "missing secret",
			secretHeader:    "",
			namespaceHeader: "testnamespace",
			expectedStatus:  401,
		},
		{
			name:            "wrong secret",
			secretHeader:    "wrong-secret",
			namespaceHeader: "testnamespace",
			expectedStatus:  401,
		},
		{
			name:            "missing namespace",
			secretHeader:    "test-secret",
			namespaceHeader: "",
			expectedStatus:  400,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.secretHeader != "" {
				req.Header.Set("X-Secret", tt.secretHeader)
			}
			if tt.namespaceHeader != "" {
				req.Header.Set("X-Namespace", tt.namespaceHeader)
			}

			recorder := httptest.NewRecorder()
			handler := Auth(cfg)(dummyHandler)
			handler.ServeHTTP(recorder, req)

			if recorder.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, recorder.Code)
			}
		})
	}
}

func TestAuthNamespaceInjectedIntoContext(t *testing.T) {
	cfg := &config.Config{}
	cfg.Auth = "test-secret"

	var capturedNamespace string
	capturingHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedNamespace = r.Context().Value(httpWriter.NamespaceKey{}).(string)
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Secret", "test-secret")
	req.Header.Set("X-Namespace", "testnamespace")

	recorder := httptest.NewRecorder()
	handler := Auth(cfg)(capturingHandler)
	handler.ServeHTTP(recorder, req)

	if capturedNamespace != "testnamespace" {
		t.Errorf("expected namespace 'testnamespace' in context, got '%s'", capturedNamespace)
	}
}

func TestNamespace(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	tests := []struct {
		name           string
		req            *http.Request
		expectedStatus int
	}{
		{
			name:           "empty namespace",
			req:            req.WithContext(context.WithValue(req.Context(), httpWriter.NamespaceKey{}, "")),
			expectedStatus: 400,
		},
		{
			name:           "long namespace",
			req:            req.WithContext(context.WithValue(req.Context(), httpWriter.NamespaceKey{}, "ivtXAItyRDpji7GrLZntlq6QH2Djgq52XdLmt1Y5ojkvFZzkvSrw5cbRawZ9rAT4q")),
			expectedStatus: 400,
		},
		{
			name:           "not alphanum",
			req:            req.WithContext(context.WithValue(req.Context(), httpWriter.NamespaceKey{}, "2345hgjfdkgjf----[]';./")),
			expectedStatus: 400,
		}, {
			name:           "valid namespace",
			req:            req.WithContext(context.WithValue(req.Context(), httpWriter.NamespaceKey{}, "testNamespace1234")),
			expectedStatus: 200,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler := Namespace(dummyHandler)
			handler.ServeHTTP(recorder, tt.req)

			if recorder.Code != tt.expectedStatus {
				t.Errorf("Expected response %d, got %d", tt.expectedStatus, recorder.Code)
			}
		})
	}
}

func TestRateLimit(t *testing.T) {
	cfg := &config.Config{}
	cfg.RateLimit = 1
	cfg.BurstLimit = 2

	rateLimitMiddleware := RateLimit(cfg)
	handler := rateLimitMiddleware(dummyHandler)

	totalRequests := 20
	results := make(chan int, totalRequests)

	var wg sync.WaitGroup
	for i := 0; i < totalRequests; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			ctx := context.WithValue(req.Context(), httpWriter.NamespaceKey{}, "testnamespace")
			req = req.WithContext(ctx)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, req)
			results <- recorder.Code
		}()
	}

	wg.Wait()
	close(results)

	var allowed, limited int
	for code := range results {
		if code == http.StatusOK {
			allowed++
		} else if code == http.StatusTooManyRequests {
			limited++
		}
	}

	if limited == 0 {
		t.Error("expected some requests to be rate limited, got none")
	}
	if allowed == 0 {
		t.Error("expected some requests to be allowed, got none")
	}
}

func TestRateLimitRetryAfterHeader(t *testing.T) {
	cfg := &config.Config{}
	cfg.RateLimit = 1
	cfg.BurstLimit = 1

	rateLimitMiddleware := RateLimit(cfg)
	handler := rateLimitMiddleware(dummyHandler)

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		ctx := context.WithValue(req.Context(), httpWriter.NamespaceKey{}, "testnamespace")
		req = req.WithContext(ctx)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := context.WithValue(req.Context(), httpWriter.NamespaceKey{}, "testnamespace")
	req = req.WithContext(ctx)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusTooManyRequests {
		t.Errorf("expected 429, got %d", recorder.Code)
	}
	if recorder.Header().Get("Retry-After") == "" {
		t.Error("expected Retry-After header to be set, got empty")
	}
}

func TestRateLimitNamespaceIsolation(t *testing.T) {
	cfg := &config.Config{}
	cfg.RateLimit = 1
	cfg.BurstLimit = 2

	rateLimitMiddleware := RateLimit(cfg)
	handler := rateLimitMiddleware(dummyHandler)

	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		ctx := context.WithValue(req.Context(), httpWriter.NamespaceKey{}, "namespaceA")
		req = req.WithContext(ctx)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)
	}

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	ctx := context.WithValue(req.Context(), httpWriter.NamespaceKey{}, "namespaceB")
	req = req.WithContext(ctx)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Errorf("expected namespace B to be allowed, got %d", recorder.Code)
	}
}
