# keiro-client

Python client SDK for [Keiro](https://github.com/yourusername/keiro) — a self-hostable adaptive RAG infrastructure.

## Installation

```bash
pip install keiro-client
```

## Quickstart

```python
from keiro import KeiroClient

client = KeiroClient(
    base_url="http://localhost:8080",
    secret="your-shared-secret",
    namespace="my-docs"
)

# Ingest a document
job_id = client.ingest("document.pdf")

# Poll until complete
while True:
    status = client.job_status(job_id)
    if status.is_terminal:
        break

# Query
response = client.query("What are the main compliance obligations?")
print(response.response)
print(f"Strategy used: {response.retrieval_details.tier_name}")
print(f"Cache hit: {response.cache_hit}")
print(f"Total tokens: {response.total_tokens}")
```

## Configuration

| Parameter | Description |
|-----------|-------------|
| `base_url` | URL of your Keiro gateway, e.g. `http://localhost:8080` |
| `secret` | Shared secret set in `KEIRO_SECRET` env var |
| `namespace` | Namespace identifier scoping all operations |
| `timeout` | Request timeout in seconds (default 120) |

## Exception Handling

```python
from keiro import (
    KeiroClient,
    AuthenticationError,
    RateLimitError,
    IngestionError,
    ConnectionError,
)

try:
    response = client.query("What is the refund policy?")
except AuthenticationError:
    print("Invalid secret")
except RateLimitError as e:
    print(f"Rate limited — retry after {e.retry_after}s")
except ConnectionError:
    print("Gateway unreachable")
```

## Links

- [Keiro repository](https://github.com/ManasRanjanJena253/Keiro)
- [Report issues](https://github.com/ManasRanjanJena253/Keiro/issues)