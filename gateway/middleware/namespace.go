package middleware

import (
	"Keiro/gateway/httpWriter"
	"net/http"
	"regexp"
)

func Namespace(next http.Handler) http.Handler {
	alphaNumRegex := regexp.MustCompile(`^[a-zA-Z0-9]+$`)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		namespace, ok := ctx.Value(httpWriter.NamespaceKey{}).(string)

		if !ok {
			httpWriter.RespondWithError(w, 400, "Invalid Namespace")
			return
		}

		if namespace == "" {
			httpWriter.RespondWithError(w, 400, "No Namespace found")
			return
		}

		if !alphaNumRegex.MatchString(namespace) || len(namespace) > 63 {
			httpWriter.RespondWithError(w, 400, "Invalid Namespace")
			return
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
