class StrawHubError(Exception):
    """Base exception for StrawHub CLI."""


class AuthError(StrawHubError):
    """Authentication failed (401)."""


class NotFoundError(StrawHubError):
    """Resource not found (404)."""


class RateLimitError(StrawHubError):
    """Rate limit exceeded (429)."""

    def __init__(self, retry_after: int = 60):
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after}s.")


class APIError(StrawHubError):
    """General API error."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        super().__init__(f"API error {status_code}: {message}")


class DependencyError(StrawHubError):
    """Dependency resolution failed."""


class LockfileError(StrawHubError):
    """Lockfile is corrupt or cannot be read/written."""
