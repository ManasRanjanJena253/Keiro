package config

import (
	"log/slog"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Gateway struct {
		Host string
		Port string
	}

	Intelligence struct {
		Host string
		Port string
	}

	Auth string
	APIs struct {
		OPENAI string
		GEMINI string
	}

	Cache struct {
		TTL                 int
		MaxSize             int
		SimilarityThreshold float64
	}

	RateLimit  int
	BurstLimit int
}

func LoadEnv() (*Config, error) {
	err := godotenv.Load()

	if err != nil {
		slog.Info("Couldn't initialize godotenv. Skipping loading.......", err)
	}

	var config Config

	config.Gateway.Host = os.Getenv("GATEWAY_HOST")
	config.Gateway.Port = os.Getenv("GATEWAY_PORT")

	config.Intelligence.Host = os.Getenv("INTELLIGENCE_HOST")
	config.Intelligence.Port = os.Getenv("INTELLIGENCE_PORT")

	config.Auth = os.Getenv("KEIRO_SECRET")
	config.APIs.GEMINI = os.Getenv("GEMINI_API_KEY")
	config.APIs.OPENAI = os.Getenv("OPENAI_API_KEY")
	config.Cache.MaxSize, _ = strconv.Atoi(os.Getenv("KEIRO_CACHE_MAX_SIZE"))
	config.Cache.TTL, _ = strconv.Atoi(os.Getenv("KEIRO_CACHE_TTL"))
	config.Cache.SimilarityThreshold, _ = strconv.ParseFloat(os.Getenv("KEIRO_CACHE_SIMILARITY_THRESHOLD"), 64)

	config.RateLimit, _ = strconv.Atoi(os.Getenv("KEIRO_RATE_LIMIT"))
	config.BurstLimit, _ = strconv.Atoi(os.Getenv("KEIRO_BURST_LIMIT"))

	return &config, nil
}
