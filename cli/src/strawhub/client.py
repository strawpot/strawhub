import httpx

from strawhub.config import get_api_url, get_token
from strawhub.errors import AuthError, NotFoundError, RateLimitError, APIError, StrawHubError


class StrawHubClient:
    """HTTP client for the StrawHub API."""

    def __init__(self, token: str | None = None, api_url: str | None = None):
        self.api_url = api_url or get_api_url()
        self.token = token or get_token()
        self._client = httpx.Client(
            base_url=self.api_url,
            timeout=30.0,
            headers=self._build_headers(),
        )

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def _build_headers(self) -> dict:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        try:
            return self._client.request(method, url, **kwargs)
        except httpx.ConnectError:
            raise StrawHubError(
                f"Could not connect to {self.api_url}. "
                "Check your network or set STRAWHUB_API_URL."
            )
        except httpx.TimeoutException:
            raise StrawHubError(f"Request to {self.api_url} timed out.")

    def _parse_json(self, resp: httpx.Response) -> dict:
        content_type = resp.headers.get("content-type", "")
        if "application/json" not in content_type and "text/html" in content_type:
            raise StrawHubError(
                f"Server returned HTML instead of JSON. "
                f"Is STRAWHUB_API_URL set to the Convex site URL?"
            )
        try:
            return resp.json()
        except Exception:
            raise StrawHubError(f"Unexpected response from server: {resp.text[:200]}")

    def _handle_response(self, resp: httpx.Response) -> dict:
        if resp.status_code == 401:
            msg = "Unauthorized"
            try:
                msg = resp.json().get("error", msg)
            except Exception:
                pass
            raise AuthError(msg)
        if resp.status_code == 404:
            msg = "Not found"
            try:
                msg = resp.json().get("error", msg)
            except Exception:
                pass
            raise NotFoundError(msg)
        if resp.status_code == 429:
            retry = int(resp.headers.get("Retry-After", "60"))
            raise RateLimitError(retry)
        if resp.status_code >= 400:
            msg = resp.text
            try:
                msg = resp.json().get("error", msg)
            except Exception:
                pass
            raise APIError(resp.status_code, msg)
        return self._parse_json(resp)

    def whoami(self) -> dict:
        resp = self._request("GET","/api/v1/whoami")
        return self._handle_response(resp)

    def search(self, query: str, kind: str = "all", limit: int = 20) -> dict:
        resp = self._request("GET",
            "/api/v1/search", params={"q": query, "kind": kind, "limit": limit}
        )
        return self._handle_response(resp)

    def list_skills(self, limit: int = 50, sort: str = "updated") -> dict:
        resp = self._request("GET",
            "/api/v1/skills", params={"limit": limit, "sort": sort}
        )
        return self._handle_response(resp)

    def list_roles(self, limit: int = 50, sort: str = "updated") -> dict:
        resp = self._request("GET",
            "/api/v1/roles", params={"limit": limit, "sort": sort}
        )
        return self._handle_response(resp)

    def get_skill(self, slug: str) -> dict:
        resp = self._request("GET",f"/api/v1/skills/{slug}")
        return self._handle_response(resp)

    def get_role(self, slug: str) -> dict:
        resp = self._request("GET",f"/api/v1/roles/{slug}")
        return self._handle_response(resp)

    def get_skill_file(self, slug: str, path: str = "SKILL.md") -> str:
        resp = self._request("GET",
            f"/api/v1/skills/{slug}/file", params={"path": path}
        )
        if resp.status_code >= 400:
            self._handle_response(resp)
        return resp.text

    def get_role_file(self, slug: str, path: str = "ROLE.md") -> str:
        resp = self._request("GET",
            f"/api/v1/roles/{slug}/file", params={"path": path}
        )
        if resp.status_code >= 400:
            self._handle_response(resp)
        return resp.text

    def resolve_role_deps(self, slug: str) -> dict:
        resp = self._request("GET",f"/api/v1/roles/{slug}/resolve")
        return self._handle_response(resp)

    def get_info(self, slug: str, kind: str | None = None) -> tuple[str, dict]:
        """Get info for a slug, auto-detecting kind if not specified.
        Returns (kind, detail_dict)."""
        if kind == "skill":
            return ("skill", self.get_skill(slug))
        if kind == "role":
            return ("role", self.get_role(slug))
        # Auto-detect: try skill first, then role
        try:
            return ("skill", self.get_skill(slug))
        except NotFoundError:
            return ("role", self.get_role(slug))

    def close(self):
        self._client.close()
