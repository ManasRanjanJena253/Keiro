package api

import (
	"Keiro/gateway/config"
	"Keiro/gateway/middleware"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

func NewRouter(envVar *config.Config) *chi.Mux {
	mainRouter := chi.NewRouter()

	mainRouter.Use(cors.Handler(cors.Options{
		AllowedHeaders:   []string{"http://*", "https://*"},
		AllowCredentials: false,
		AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
		MaxAge:           500,
	}))

	mainRouter.Use(middleware.Logging)
	mainRouter.Use(middleware.Tracing)
	mainRouter.Use(middleware.Auth(envVar))
	mainRouter.Use(middleware.Namespace)
	mainRouter.Use(middleware.RateLimit(envVar))

	v1Router := chi.NewRouter()

	mainRouter.Get("/health", CheckHealth)
	v1Router.Post("/query", HandleUserQuery)
	v1Router.Post("/ingest", IngestHandler)
	v1Router.Get("/jobs/{id}", JobHandler)

	mainRouter.Mount("/v1", v1Router)

	return mainRouter
}
