package metrics

import "github.com/prometheus/client_golang/prometheus"

var (
	CacheHits = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "keiro_cache_hits_total",
			Help: "Total number of semantic cache hits",
		},
		[]string{"namespace"},
	)

	CacheMisses = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "keiro_cache_misses_total",
			Help: "Total number of semantic cache misses",
		},
		[]string{"namespace"},
	)

	QueryLatency = prometheus.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "keiro_query_latency_seconds",
			Help:    "Query latency in seconds by retrieval tier",
			Buckets: []float64{0.1, 0.25, 0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 20.0},
		},
		[]string{"tier"},
	)

	TokenUsage = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "keiro_token_usage_total",
			Help: "Total number of tokens used per namespace and model",
		},
		[]string{"namespace", "model"},
	)

	IngestionThroughput = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "keiro_ingestion_documents_total",
			Help: "Total number of documents ingested per namespace",
		},
		[]string{"namespace"},
	)

	ActiveIngestionJobs = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "keiro_active_ingestion_jobs",
			Help: "Current number of active ingestion jobs",
		},
	)

	RateLimitRejections = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "keiro_rate_limit_rejections_total",
			Help: "Total number of rate limit rejections per namespace",
		},
		[]string{"namespace"},
	)
)

func init() {
	prometheus.MustRegister(
		CacheHits,
		CacheMisses,
		QueryLatency,
		TokenUsage,
		IngestionThroughput,
		ActiveIngestionJobs,
		RateLimitRejections,
	)
}
