package main

import (
	"Keiro/gateway/api"
	config "Keiro/gateway/config"
	"Keiro/gateway/intelligence"
	"Keiro/gateway/queue"
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {

	envVar, loadErr := config.LoadEnv()

	if loadErr != nil {
		slog.Error("Unable to load env",
			"ERROR", loadErr)
		os.Exit(1)
	} else {
		slog.Info("Loaded Env")
	}
	pythonClient, conn, intelServerErr := intelligence.ConnectToPython(envVar)

	if intelServerErr != nil {
		slog.Error("Unable to connect with the intelligence client",
			"ERROR", intelServerErr)
		os.Exit(1)
	} else {
		slog.Info("Connected with the Intelligence layer")
	}

	tracker := queue.NewJobTracker()
	inQueue := queue.NewIngestionQueue(context.Background(), tracker, pythonClient)
	mainRouter, routingErr := api.NewRouter(envVar, pythonClient, inQueue, tracker)

	if routingErr != nil {
		slog.Error("Unable to get router.",
			"ERROR", routingErr)
		os.Exit(1)
	} else {
		slog.Info("Router Initialized Successfully.....")
	}

	port := envVar.Gateway.Port
	host := envVar.Gateway.Host
	address := host + ":" + port
	log.Println("Host:Port ", address)

	server := &http.Server{
		Handler: mainRouter,
		Addr:    address,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Server error", "ERROR", err)
		}
	}()

	slog.Info("Server started", "PORT", server.Addr)

	<-quit // Blocks until signal received

	slog.Info("Shutting Down server......")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		slog.Error("Forced Shutdown", "ERROR", err)
	}

	err := conn.Close()
	if err != nil {
		slog.Error("Couldn't close intelligence client server", "ERROR", err)
	}

	slog.Info("Server stopped")
}
