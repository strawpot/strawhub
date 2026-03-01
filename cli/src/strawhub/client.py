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

    def get_skill(self, slug: str, version: str | None = None) -> dict:
        params = {}
        if version:
            params["version"] = version
        resp = self._request("GET", f"/api/v1/skills/{slug}", params=params or None)
        return self._handle_response(resp)

    def get_role(self, slug: str, version: str | None = None) -> dict:
        params = {}
        if version:
            params["version"] = version
        resp = self._request("GET", f"/api/v1/roles/{slug}", params=params or None)
        return self._handle_response(resp)

    def get_skill_file(self, slug: str, path: str = "SKILL.md", version: str | None = None) -> str:
        params: dict = {"path": path}
        if version:
            params["version"] = version
        resp = self._request("GET", f"/api/v1/skills/{slug}/file", params=params)
        if resp.status_code >= 400:
            self._handle_response(resp)
        return resp.text

    def get_role_file(self, slug: str, path: str = "ROLE.md", version: str | None = None) -> str:
        params: dict = {"path": path}
        if version:
            params["version"] = version
        resp = self._request("GET", f"/api/v1/roles/{slug}/file", params=params)
        if resp.status_code >= 400:
            self._handle_response(resp)
        return resp.text

    def resolve_role_deps(self, slug: str) -> dict:
        resp = self._request("GET",f"/api/v1/roles/{slug}/resolve")
        return self._handle_response(resp)

    def get_info(self, slug: str, kind: str, version: str | None = None) -> tuple[str, dict]:
        """Get info for a slug with explicit kind.
        Returns (kind, detail_dict)."""
        if kind == "skill":
            return ("skill", self.get_skill(slug, version=version))
        return ("role", self.get_role(slug, version=version))

    # ── Publish ────────────────────────────────────────────────────────────────

    def publish_skill(self, form_data: dict, files: list) -> dict:
        resp = self._request("POST", "/api/v1/skills", data=form_data, files=files)
        return self._handle_response(resp)

    def publish_role(self, form_data: dict, files: list) -> dict:
        resp = self._request("POST", "/api/v1/roles", data=form_data, files=files)
        return self._handle_response(resp)

    # ── Stars ─────────────────────────────────────────────────────────────────

    def toggle_star(self, slug: str, kind: str) -> dict:
        resp = self._request(
            "POST", "/api/v1/stars/toggle", json={"slug": slug, "kind": kind}
        )
        return self._handle_response(resp)

    # ── Delete ────────────────────────────────────────────────────────────────

    def delete_skill(self, slug: str) -> dict:
        resp = self._request("DELETE", f"/api/v1/skills/{slug}")
        return self._handle_response(resp)

    def delete_role(self, slug: str) -> dict:
        resp = self._request("DELETE", f"/api/v1/roles/{slug}")
        return self._handle_response(resp)

    def delete_package(self, slug: str, kind: str) -> dict:
        if kind == "skill":
            return self.delete_skill(slug)
        return self.delete_role(slug)

    # ── Admin ─────────────────────────────────────────────────────────────────

    def ban_user(self, handle: str, blocked: bool, reason: str | None = None) -> dict:
        body: dict = {"handle": handle, "blocked": blocked}
        if reason:
            body["reason"] = reason
        resp = self._request("POST", "/api/v1/admin/ban-user", json=body)
        return self._handle_response(resp)

    def set_user_role(self, handle: str, role: str) -> dict:
        resp = self._request(
            "POST", "/api/v1/admin/set-role", json={"handle": handle, "role": role}
        )
        return self._handle_response(resp)

    def close(self):
        self._client.close()
