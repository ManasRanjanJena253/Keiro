package main

import (
	"Keiro/gateway/api"
	config "Keiro/gateway/config"
	"Keiro/gateway/intelligence"
	"log"
	"log/slog"
	"net/http"
)

func main() {

	envVar, err := config.LoadEnv()
	mainRouter := api.NewRouter(envVar)

	if err != nil {
		slog.Error("Unable to load env",
			"ERROR", err)
	} else {
		slog.Info("Loaded Env")
	}

	client, err := intelligence.ConnectToPython(envVar)

	if err != nil {
		slog.Error("Unable to fetch client", "ERROR", err)
	}

	log.Println("Initiating call to ClassifyQuery.....")
	intelligence.ClassifyQuery(client, "Hello", "test")

	//log.Println("Test complete.")

	port := "7000"
	log.Println("Port", port)

	serve := &http.Server{
		Handler: mainRouter,
		Addr:    ":" + port,
	}
	slog.Info("Server started", "PORT", serve.Addr)
	servErr := serve.ListenAndServe()

	if servErr != nil {
		slog.Error("Server stopped", "ERROR", servErr)
	}
}
