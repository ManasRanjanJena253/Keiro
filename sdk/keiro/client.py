from __future__ import annotations

import httpx
from pathlib import Path

from .exceptions import (
    AuthenticationError,
    ConnectionError,
    IngestionError,
    KeiroError,
    RateLimitError,
)
from .models import IngestResponse, JobStatusResponse, QueryResponse


class KeiroClient:
    """
    Synchronous client for the Keiro adaptive RAG gateway.

    Parameters
    ----------
    base_url:  Base URL of the Go gateway, e.g. "http://localhost:8080"
    secret:    Shared secret configured in KEIRO_SECRET
    namespace: Namespace identifier scoping all operations to an isolated
               ChromaDB collection
    timeout:   httpx timeout in seconds (default 120 — multi-hop queries
               can be slow)
    """

    def __init__(
            self,
            base_url: str,
            secret: str,
            namespace: str,
            timeout: float = 120.0,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {
            "X-Secret":    secret,
            "X-Namespace": namespace,
        }
        self._client = httpx.Client(
            base_url=self._base_url,
            headers=self._headers,
            timeout=timeout,
        )

    # ── public interface ──────────────────────────────────────────────────────

    def query(self, query_text: str) -> QueryResponse:
        """
        Submit a query to the adaptive RAG pipeline.

        The gateway classifies the query, selects the appropriate retrieval
        tier, runs retrieval and generation, and returns the response with
        full metadata including strategy used, token counts, and cache status.

        Parameters
        ----------
        query_text: The question or instruction to answer from the ingested
                    document corpus

        Returns
        -------
        QueryResponse with fields: response, prompt_tokens, completion_tokens,
        response_model, cache_hit, retrieval_details (tier + top_k)
        """
        raw = self._post("/v1/query", json={"query": query_text})
        return QueryResponse.model_validate(raw)

    def ingest(self, file_path: str | Path) -> str:
        """
        Upload a document for ingestion into the namespace.

        The request returns immediately with a job ID. Ingestion runs
        asynchronously — use job_status() to poll until complete.

        Parameters
        ----------
        file_path: Path to a PDF or plain text file

        Returns
        -------
        job_id string — use with job_status() to track progress
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path}")

        with path.open("rb") as f:
            raw = self._post_multipart(
                "/v1/ingest",
                files={"file": (path.name, f, _mime_type(path))},
            )
        return IngestResponse.model_validate(raw).job_id

    def job_status(self, job_id: str) -> JobStatusResponse:
        """
        Poll the status of an ingestion job.

        Parameters
        ----------
        job_id: Job ID returned by ingest()

        Returns
        -------
        JobStatusResponse with job_status (pending/processing/complete/failed),
        and error string if failed. Use .is_terminal, .is_complete, .is_failed
        properties to branch on status without comparing integers directly.

        Raises
        ------
        IngestionError if the job has reached failed status
        """
        raw = self._get(f"/v1/jobs/{job_id}")
        result = JobStatusResponse.model_validate(raw)
        if result.is_failed:
            raise IngestionError(job_id, result.error)
        return result

    def health(self) -> dict:
        """
        Check liveness and readiness of all stack components.

        Returns the raw health response dict from the gateway.
        """
        return self._get("/health")

    def close(self) -> None:
        """Close the underlying httpx client. Call when done if not using
        the client as a context manager."""
        self._client.close()

    # ── context manager ───────────────────────────────────────────────────────

    def __enter__(self) -> KeiroClient:
        return self

    def __exit__(self, *_) -> None:
        self.close()

    # ── internal helpers ──────────────────────────────────────────────────────

    def _post(self, path: str, **kwargs) -> dict:
        return self._request("POST", path, **kwargs)

    def _post_multipart(self, path: str, **kwargs) -> dict:
        return self._request("POST", path, **kwargs)

    def _get(self, path: str) -> dict:
        return self._request("GET", path)

    def _request(self, method: str, path: str, **kwargs) -> dict:
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx.ConnectError as e:
            raise ConnectionError(
                f"Cannot reach Keiro gateway at {self._base_url}: {e}"
            ) from e
        except httpx.TimeoutException as e:
            raise KeiroError(f"Request timed out: {e}") from e

        if response.status_code == 401:
            raise AuthenticationError("Invalid or missing X-Secret header")
        if response.status_code == 429:
            retry_after = float(response.headers.get("Retry-After", 0) or 0)
            raise RateLimitError(retry_after=retry_after or None)
        if response.status_code >= 400:
            raise KeiroError(
                f"Gateway returned {response.status_code}: {response.text}"
            )

        return response.json()


# ── helpers ───────────────────────────────────────────────────────────────────

def _mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".md":  "text/markdown",
    }.get(suffix, "application/octet-stream")