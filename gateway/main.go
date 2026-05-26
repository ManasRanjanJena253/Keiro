package main

import (
	config "Keiro/gateway/config"
	"Keiro/gateway/intelligence"
	"log"
	"log/slog"
)

func main() {
	// mainRouter := api.NewRouter()
	envVar, err := config.LoadEnv()

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

	log.Println("Test complete.")

}
