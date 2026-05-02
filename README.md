# Keiro (経路)

Keiro is a self-hostable adaptive RAG infrastructure for organizations
that want production-grade retrieval without building it themselves. A
Go gateway handles the API (REST + gRPC), semantic caching, per-tenant
rate limiting, and namespace isolation — while a Python intelligence layer
classifies each query and dynamically selects the right retrieval strategy:
simple top-k for factual queries, iterative multi-hop for complex ones.
Deploy with a single `docker compose up`. Bring your own LLM API key and
embedding model. Your data never leaves your infrastructure. Benchmarked
on RAGAS metrics against naive RAG, with p50/p95/p99 latency profiling
under concurrent load.

> Status: Active development — July 2026