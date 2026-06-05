package api

import (
	"net/http"
	"os"
	"path/filepath"
)

// ServeUIPage returns a handler that serves a named HTML file from the templates directory.
func ServeUIPage(filename string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tmplDir := os.Getenv("TEMPLATES_DIR")
		if tmplDir == "" {
			tmplDir = "templates"
		}
		http.ServeFile(w, r, filepath.Join(tmplDir, filename))
	}
}

// StaticFileHandler serves files from the static directory.
func StaticFileHandler() http.Handler {
	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "static"
	}
	return http.FileServer(http.Dir(staticDir))
}
