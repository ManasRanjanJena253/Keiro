class KeiroError(Exception):
    """Base exception for all Keiro client errors."""
    pass


class AuthenticationError(KeiroError):
    """Raised when the shared secret is invalid or missing (HTTP 401)."""
    pass


class RateLimitError(KeiroError):
    """Raised when the namespace rate limit is exceeded (HTTP 429)."""

    def __init__(self, retry_after: float | None = None):
        self.retry_after = retry_after
        msg = "Rate limit exceeded"
        if retry_after:
            msg += f" — retry after {retry_after}s"
        super().__init__(msg)


class IngestionError(KeiroError):
    """Raised when an ingestion job reaches failed status."""

    def __init__(self, job_id: str, detail: str = ""):
        self.job_id = job_id
        super().__init__(f"Ingestion job {job_id} failed: {detail}")


class ConnectionError(KeiroError):
    """Raised when the gateway cannot be reached."""
    pass