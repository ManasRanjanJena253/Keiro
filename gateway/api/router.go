package api

import (
	"Keiro/gateway/config"
	"Keiro/gateway/middleware"
	pb "Keiro/generated/go/proto"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

func NewRouter(envVar *config.Config, intelClient pb.IntelligenceServiceClient) (*chi.Mux, error) {
	mainRouter := chi.NewRouter()

	mainRouter.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://*", "https://*"},
		AllowedHeaders:   []string{"Content-Type", "X-Secret", "X-Namespace"},
		AllowCredentials: false,
		AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
		MaxAge:           500,
	}))

	queryHandler := NewQueryHandler(intelClient, envVar.Cache.TTL, envVar.Cache.MaxSize, float32(envVar.Cache.SimilarityThreshold))

	mainRouter.Use(middleware.Logging)
	mainRouter.Use(middleware.Tracing)

	v1Router := chi.NewRouter()

	v1Router.Use(middleware.Auth(envVar))
	v1Router.Use(middleware.Namespace)
	v1Router.Use(middleware.RateLimit(envVar))

	mainRouter.Get("/health", CheckHealth)
	v1Router.Post("/query", queryHandler.HandleUserQuery)
	v1Router.Post("/ingest", IngestHandler)
	v1Router.Get("/jobs/{id}", JobHandler)

	mainRouter.Mount("/v1", v1Router)

	return mainRouter, nil
}
