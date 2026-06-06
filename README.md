# Keiro

![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)
![gRPC](https://img.shields.io/badge/gRPC-proto3-244c5a?style=flat&logo=grpc&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?style=flat&logo=docker&logoColor=white)
![ChromaDB](https://img.shields.io/badge/ChromaDB-vector%20store-FF6B35?style=flat)
![Redis](https://img.shields.io/badge/Redis-semantic%20cache-DC382D?style=flat&logo=redis&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green?style=flat)

> *From Japanese 経路 (keiro) — path, route.*

Keiro is a self-hostable adaptive RAG infrastructure that routes queries through three retrieval tiers based on complexity, reducing token usage on simple queries by up to 49% while improving context recall on multi-hop reasoning tasks. A single `docker compose up` starts the full stack with zero additional configuration beyond environment variables.

---

## Why Keiro

Most RAG implementations treat every query the same way: embed the question, retrieve fixed top-k chunks, call the LLM. This works adequately for simple factual lookups but wastes tokens on them and retrieves too little context for complex synthesis or chained reasoning questions.

Keiro classifies each query before retrieval and routes it through the appropriate strategy:

- A simple factual question retrieves two chunks, skips reranking, and checks the semantic cache first. If a similar question was answered recently, it returns immediately.
- A complex synthesis question retrieves eight chunks with MMR diversity filtering followed by cross-encoder reranking to surface the most relevant content.
- A multi-hop reasoning question runs iterative retrieval across up to three hops, using each hop's result to reformulate the next query until the full answer chain is assembled.

The result is a system that spends computation proportionally to query difficulty rather than uniformly.

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │              Go API Gateway                  │
  HTTP Request  ──► │                                             │
  (X-Secret,        │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
   X-Namespace)     │  │   Auth   │  │Namespace │  │  Rate    │ │
                    │  │Middleware│─►│Isolation │─►│ Limiter  │ │
                    │  └──────────┘  └──────────┘  └──────────┘ │
                    │                     │                       │
                    │         ┌───────────▼───────────┐          │
                    │         │    Semantic Cache      │          │
                    │         │  (Redis + cosine sim)  │          │
                    │         └───────────┬───────────┘          │
                    │               miss  │                       │
                    │         ┌───────────▼───────────┐          │
                    │         │    gRPC Client         │          │
                    └─────────┴───────────┬───────────┴──────────┘
                                          │ gRPC (proto3)
                    ┌─────────────────────▼───────────────────────┐
                    │           Python Intelligence Layer          │
                    │                                             │
                    │  ┌─────────────┐                           │
                    │  │  Classifier │ simple / complex / multi-hop│
                    │  └──────┬──────┘                           │
                    │         │                                   │
                    │  ┌──────▼──────────────────────────────┐   │
                    │  │          Retrieval Router             │   │
                    │  │                                      │   │
                    │  │  Simple    Complex      Multi-hop    │   │
                    │  │  top-2     top-8 MMR    iterative    │   │
                    │  │  no rerank +cross-enc   3 hops max   │   │
                    │  └──────────────┬───────────────────────┘   │
                    │                 │                           │
                    │         ┌───────▼────────┐                 │
                    │         │   ChromaDB     │                 │
                    │         │ (namespace-    │                 │
                    │         │  scoped)       │                 │
                    │         └───────┬────────┘                 │
                    │                 │                           │
                    │         ┌───────▼────────┐                 │
                    │         │   LLM Layer    │                 │
                    │         │ Gemini / OpenAI│                 │
                    │         └───────┬────────┘                 │
                    └─────────────────┼───────────────────────────┘
                                      │
                              Response + metadata
                         (strategy, tokens, cache status)
```

### Request lifecycle

1. The caller sends `POST /v1/query` with a shared secret header and a namespace identifier.
2. Go middleware validates the secret, extracts the namespace, and enforces a per-namespace token bucket rate limit.
3. Go calls `ComputeEmbedding` via gRPC, then performs a cosine similarity lookup against the namespace-scoped semantic cache. A hit returns immediately.
4. On a cache miss, Go calls `ClassifyQuery`. The Python classifier returns a tier (simple / complex / multi-hop) and a strategy configuration.
5. Go calls `ExecuteRetrieval` with the strategy config. Python runs the appropriate retriever against the namespace's ChromaDB collection.
6. Go calls `GenerateResponse`. Python assembles the prompt and calls the configured LLM.
7. Go stores the embedding and response in the semantic cache with a TTL, then returns the answer with full metadata.

### Ingestion lifecycle

`POST /v1/ingest` validates the file, enqueues an async job, and returns a job ID immediately. A background goroutine calls `IngestDocument` via gRPC. Python loads the document, chunks it with the configured strategy, embeds each chunk, and upserts to the namespace's ChromaDB collection. The caller polls `GET /v1/jobs/{id}` until the status reaches `complete` or `failed`.

---

## Design Decisions

### Go gateway + Python intelligence layer, not a monolith

The Go gateway handles everything that needs to be concurrent and fast: auth, rate limiting, semantic cache lookups, job queueing, observability. The Python intelligence layer handles everything that needs the ML ecosystem: embeddings, reranking, LLM calls. The boundary between them is a protobuf contract defined in `rag.proto` before either service is written. This means the contract is explicit and versioned rather than implicit and drifting.

### No LangChain, no LlamaIndex, no heavy orchestration framework

Both were evaluated and rejected. LangChain abstracts away the retrieval logic that is the core architectural contribution of this project — the three-tier routing, MMR diversity selection, and multi-hop reformulation are all things LangChain would obscure behind generic interfaces. The Python intelligence layer is approximately 800 lines of direct calls to `sentence-transformers`, `chromadb`, and `google-generativeai`. Every retrieval decision is traceable to a specific function with no framework magic in between.

### Proto-first design

`rag.proto` is written in full before any handler code. The five RPCs (`ClassifyQuery`, `ExecuteRetrieval`, `GenerateResponse`, `IngestDocument`, `ComputeEmbedding`) and all their message types are designed as a contract before either side implements them. This prevents the common failure mode of building both sides simultaneously and discovering a mismatch when wiring them together.

### Namespace isolation over full multi-tenancy

Full API key management — key rotation, user registration, per-key quotas — is infrastructure that belongs in a dedicated auth service, not in a research prototype. Keiro uses a simpler model: one shared secret per deployment, with namespace isolation enforced at the ChromaDB collection level. Each namespace is a string identifier that scopes all vector operations to an isolated collection. Rate limiting is per-namespace. The semantic cache is keyed by `namespace:embedding_hash` so a cache hit in one namespace cannot serve another. Data isolation is provably correct; auth complexity is deferred.

### Semantic cache with HMAC-style namespace scoping

The cache does not store queries by text. It stores embedding vectors and computes cosine similarity on lookup. A similarity above the configured threshold (default 0.92) returns the cached response without touching the classifier, retriever, or LLM. This means semantically equivalent questions with different phrasing hit the cache. The threshold of 0.92 was chosen empirically based on a sweep from 0.85 to 0.98 — see the benchmark section.

### Token bucket rate limiting in Go, not a sidecar

Rate limiting is implemented as a `sync.Map` of namespace to `golang.org/x/time/rate` token bucket directly in the middleware chain. Adding a Redis sidecar or API gateway for rate limiting would be appropriate for a production multi-tenant SaaS; for a self-hosted tool it is unnecessary infrastructure. The middleware is race-free and has been tested under concurrent load.

---

## Retrieval Tiers

| Tier | Strategy | top-k | Reranking | Cache | Typical use |
|------|----------|-------|-----------|-------|-------------|
| Simple | Direct retrieval | 2 | None | Check first | Single-fact lookups: definitions, dates, named values |
| Complex | MMR diversity + cross-encoder | 8 | Cross-encoder (ms-marco-MiniLM-L6-v2) | On miss | Synthesis across sections: comparisons, multi-aspect analysis |
| Multi-hop | Iterative retrieval, max 3 hops | 3 per hop | None | On miss | Chained reasoning: answers that depend on prior retrieved answers |

The classifier is a prompted Gemini Flash call with structured JSON output. Classification latency is kept low because the classifier runs on every cache miss and its latency directly adds to p50 query latency.

---

## Benchmark Results

Evaluated on 50 questions across three complexity tiers derived from the EU AI Act (EUR-Lex 2024/1689). Two independent LLM judges scored each response on faithfulness, context recall, and context precision.

**Evaluation methodology:** LLM-as-judge evaluation using Claude Sonnet 4.6 and Gemini 2.5 Pro as independent judges. Reference answers generated against the full document text. Naive RAG baseline uses fixed top-5 retrieval with no classification, no reranking, and no caching.

### Overall quality metrics

![Figure 1: Overall metric comparison across both judges](benchmarks/results/fig1_overall_metrics.png)

*Naive RAG (blue) vs. Adaptive RAG (red) scored by two independent judges. Adaptive RAG shows improved context recall (+2.2pp overall, +9.4pp on multi-hop queries per Claude judge) with a faithfulness tradeoff explained below.*

### Per-tier breakdown — Claude Sonnet 4.6 judge

![Figure 2: Per-tier metrics, Claude judge](benchmarks/results/fig2_per_tier_claude_judge.png)

### Per-tier breakdown — Gemini 2.5 Pro judge

![Figure 3: Per-tier metrics, Gemini judge](benchmarks/results/fig3_per_tier_gemini_judge.png)

*Gemini scores higher overall (less penalising on faithfulness), consistent with known leniency differences between frontier judges. Both judges agree on the directional finding: context recall improves on multi-hop queries and faithfulness trades off slightly on complex queries routed to multi-hop retrieval.*

### Score delta heatmap

![Figure 5: Delta heatmap](benchmarks/results/fig5_delta_heatmap.png)

*Green cells indicate metrics where Adaptive RAG outperforms Naive. Red cells indicate tradeoffs. The consistent finding across both judges: context recall is the win, faithfulness is the cost, and the cost concentrates in the complex tier where classifier over-routing to multi-hop is the known limitation.*

### Token efficiency

![Figure 4: Token usage by tier](benchmarks/results/fig4_token_usage.png)

*Simple queries use 744 tokens on average with Adaptive RAG versus 1,448 for Naive RAG — a 49% reduction. Complex and multi-hop queries intentionally use more tokens because they retrieve more context. The system allocates compute proportionally to query difficulty.*

### Classifier routing accuracy

![Figure 6: Routing accuracy](benchmarks/results/fig6_routing_accuracy.png)

*Simple (100%) and multi-hop (70%) tiers are classified reliably. The complex tier (0%) collapses to multi-hop routing. This is a known structural issue: complex synthesis questions and multi-hop reasoning questions are adjacent in semantic space and difficult to separate with a single prompted classifier. Routing complex queries to multi-hop is the safer failure mode — it over-retrieves rather than under-retrieves — and the faithfulness tradeoff observed above is a direct consequence.*

### Key findings

The primary validated contribution is **context recall improvement on multi-hop queries (+9.4pp, Claude judge; +6.7pp, Gemini judge)** with a 49% token reduction on simple queries. The faithfulness tradeoff in the complex tier is a classifier calibration issue, not a retrieval architecture issue. A classifier trained explicitly on the complex/multi-hop boundary would be expected to close this gap.

---

## Stack

| Component | Role | Choice |
|-----------|------|--------|
| Go 1.22+ | API gateway, cache, rate limiter, job queue | Concurrency without the GIL; tokio is the Python equivalent but Python owns the ML ecosystem |
| Python 3.11+ | Classifier, retrievers, embeddings, LLM | Only viable option for `sentence-transformers` and `chromadb` |
| protobuf 3 | Go ↔ Python contract | Explicit versioned contract; REST would be untyped and slower |
| ChromaDB | Vector store | Embeds as a container; no managed service dependency |
| Redis | Semantic cache backing store | TTL support and persistence across restarts |
| Prometheus + Grafana | Metrics | Pre-built dashboard committed to repo; loads on `compose up` |
| OpenTelemetry + Jaeger | Distributed tracing | Single trace spans Go cache check → Python classifier → ChromaDB → LLM |
| `sentence-transformers` | Embeddings + reranking | `all-MiniLM-L6-v2` works with zero API keys; `cross-encoder/ms-marco-MiniLM-L6-v2` for reranking |
| `google-generativeai` | LLM calls | Direct SDK, not a framework wrapper |

---

## Quickstart

**Prerequisites:** Docker, Docker Compose. Nothing else required for the local embedder path.

```bash
git clone https://github.com/yourusername/keiro.git
cd keiro
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
KEIRO_SECRET=your-shared-secret
KEIRO_EMBEDDING_MODEL=local
KEIRO_LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key
KEIRO_GEMINI_MODEL_NAME=gemini-2.0-flash
```

```bash
docker compose up
```

The stack starts: Go gateway (`:8080`), Python intelligence layer (`:28080`), ChromaDB (`:7777`), Redis, Prometheus (`:9090`), Grafana (`:3000`).

**Ingest a document:**

```bash
curl -X POST http://localhost:8080/v1/ingest \
  -H "X-Secret: your-shared-secret" \
  -H "X-Namespace: my-namespace" \
  -F "file=@/path/to/document.pdf"
# returns {"job_id": "..."}
```

**Poll ingestion status:**

```bash
curl http://localhost:8080/v1/jobs/{job_id} \
  -H "X-Secret: your-shared-secret" \
  -H "X-Namespace: my-namespace"
```

**Query:**

```bash
curl -X POST http://localhost:8080/v1/query \
  -H "X-Secret: your-shared-secret" \
  -H "X-Namespace: my-namespace" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the purpose of this document?"}'
```

**Python SDK:**

```python
from keiro import KeiroClient

client = KeiroClient(
    base_url="http://localhost:8080",
    secret="your-shared-secret",
    namespace="my-namespace"
)

job_id = client.ingest("document.pdf")
client.wait_for_ingestion(job_id)

response = client.query("What are the main obligations for high-risk AI providers?")
print(response.answer)
print(f"Strategy used: {response.retrieval_strategy}")
print(f"Cache hit: {response.cache_hit}")
```

---

## Namespace Isolation Demo

Demonstrates that queries never cross namespace boundaries — the core correctness guarantee.

```bash
# Ingest different documents into two namespaces
curl -X POST http://localhost:8080/v1/ingest \
  -H "X-Secret: your-secret" -H "X-Namespace: ns-alpha" \
  -F "file=@eu_ai_act.pdf"

curl -X POST http://localhost:8080/v1/ingest \
  -H "X-Secret: your-secret" -H "X-Namespace: ns-beta" \
  -F "file=@gdpr.pdf"

# Query ns-alpha for EU AI Act content — should answer
curl -X POST http://localhost:8080/v1/query \
  -H "X-Secret: your-secret" -H "X-Namespace: ns-alpha" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the entry into force date of the EU AI Act?"}'

# Query ns-alpha for GDPR content — should return no information
curl -X POST http://localhost:8080/v1/query \
  -H "X-Secret: your-secret" -H "X-Namespace: ns-alpha" \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the right to erasure under GDPR?"}'
```

The second query returns the model's "insufficient context" response, confirming ns-alpha has no access to ns-beta's document corpus.

---

## Observability

Grafana dashboard loads automatically on `docker compose up` at `http://localhost:3000`.

Panels: cache hit rate over time, query latency by tier (p50/p95/p99), token usage by namespace and model, ingestion throughput, rate limit rejections by namespace.

Distributed traces are available in Jaeger at `http://localhost:16686`. A single trace spans the full request lifecycle: Go cache check → gRPC call → Python classifier → ChromaDB retrieval → LLM call → Go response.

---

## API Reference

Full OpenAPI spec available at `http://localhost:8080/docs` after startup.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/query` | Submit a query; returns answer, strategy metadata, token usage, cache status |
| `POST` | `/v1/ingest` | Upload a document; returns job ID immediately |
| `GET` | `/v1/jobs/{id}` | Poll ingestion job status |
| `GET` | `/health` | Liveness and readiness check for all components |

**Required headers for all endpoints:**

```
X-Secret: <shared-secret>
X-Namespace: <namespace-identifier>
```

---

## Configuration

All configuration is via environment variables. See `.env.example` for the full reference.

| Variable | Description | Default |
|----------|-------------|---------|
| `KEIRO_SECRET` | Shared secret for API authentication | Required |
| `KEIRO_EMBEDDING_MODEL` | `local` / `openai` / `gemini` | `local` |
| `KEIRO_LLM_PROVIDER` | `gemini` / `openai` / `ollama` | Required |
| `KEIRO_CHUNK_SIZE` | Tokens per chunk | `1024` |
| `KEIRO_OVERLAP` | Chunk overlap in tokens | `200` |
| `KEIRO_MMR_RETRIEVAL_LAMBDA` | MMR diversity weight (0=max diversity, 1=max relevance) | `0.5` |
| `KEIRO_OLLAMA_URL` | Ollama API base URL | `http://localhost:11434/v1` |

---

## Project Structure

```
keiro/
├── proto/
│   └── rag.proto                  # Single source of truth for Go ↔ Python contract
├── gateway/                       # Go service
│   ├── api/                       # HTTP handlers
│   ├── middleware/                 # Auth, namespace, rate limit, tracing, logging
│   ├── cache/                     # Semantic cache, LRU store, embedding cache
│   ├── queue/                     # Async ingestion queue and job tracker
│   ├── intelligence/              # gRPC client wrapping Python RPCs
│   └── metrics/                   # Prometheus counters and histograms
├── intelligence/                  # Python service
│   ├── classifier/                # Query complexity classification
│   ├── retrieval/                 # Simple, complex, multi-hop retrievers
│   ├── reranker/                  # Cross-encoder reranking
│   ├── embeddings/                # Local, OpenAI, Gemini embedders
│   ├── llm/                       # Gemini, OpenAI LLM wrappers
│   ├── ingestion/                 # Document loading, chunking, pipeline
│   └── vectorstore/               # ChromaDB namespace-scoped operations
├── sdk/                           # pip-installable Python client
├── benchmarks/                    # RAGAS eval, load tests, cache sweep
│   └── results/                   # Benchmark outputs and plots
├── docker/                        # Dockerfiles for gateway and intelligence
├── docker-compose.yml
├── prometheus.yml
└── .env.example
```

---

## License

MIT