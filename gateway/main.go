package main

import (
	"Keiro/gateway/intelligence"
	"log"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
)

func main() {
	mainRouter := chi.NewRouter()
	client := intelligence.ConnectToPython()

	mainRouter.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
		AllowedMethods:   []string{"POST", "GET", "DELETE", "OPTIONS"},
		AllowCredentials: false,
		MaxAge:           300,
		ExposedHeaders:   []string{"Link"},
		AllowedHeaders:   []string{"*"},
	}))

	log.Println("Initiating call to ClassifyQuery.....")
	intelligence.ClassifyQuery(client, "Hello", "test")

	log.Println("Test complete.")
}
