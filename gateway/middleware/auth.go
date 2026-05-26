package middleware

import (
	"Keiro/gateway/config"
	"Keiro/gateway/httpWriter"
	"context"
	"net/http"
)

func Auth(envVar *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			apiKey := r.Header.Get("X-Secret")

			if apiKey == "" {
				httpWriter.RespondWithError(w, 401, "Secret Key Not Found")
				return
			}

			if apiKey == envVar.Auth {
				namespace := r.Header.Get("X-Namespace")

				if namespace == "" {
					httpWriter.RespondWithError(w, 400, "Unable to read Namespace")
					return
				}

				ctx := context.WithValue(r.Context(), httpWriter.NamespaceKey{}, namespace)
				next.ServeHTTP(w, r.WithContext(ctx))
			} else {
				httpWriter.RespondWithError(w, 401, "Unauthorized Request")
			}
		})
	}
}
