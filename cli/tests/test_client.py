"""Tests for StrawHubClient HTTP response handling."""

from unittest.mock import patch, MagicMock

import httpx
import pytest

from strawhub.client import StrawHubClient
from strawhub.errors import AuthError, NotFoundError, RateLimitError, APIError, StrawHubError


@pytest.fixture
def client():
    """Create a client with a fake token and URL so it never hits real API."""
    with patch("strawhub.client.get_api_url", return_value="https://fake.test"):
        with patch("strawhub.client.get_token", return_value="fake-token"):
            c = StrawHubClient()
            yield c
            c.close()


def _mock_response(status_code=200, json_data=None, text="", headers=None, content_type="application/json"):
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.text = text or (str(json_data) if json_data else "")
    resp.content = resp.text.encode()
    resp.headers = headers or {"content-type": content_type}
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = Exception("No JSON")
    return resp


class TestBuildHeaders:
    def test_includes_bearer_token(self, client):
        headers = client._build_headers()
        assert headers["Authorization"] == "Bearer fake-token"
        assert headers["Accept"] == "application/json"

    def test_no_auth_header_without_token(self):
        with patch("strawhub.client.get_api_url", return_value="https://fake.test"):
            with patch("strawhub.client.get_token", return_value=None):
                c = StrawHubClient()
                headers = c._build_headers()
                assert "Authorization" not in headers
                c.close()


class TestHandleResponse:
    def test_success_returns_json(self, client):
        resp = _mock_response(200, {"ok": True})
        result = client._handle_response(resp)
        assert result == {"ok": True}

    def test_401_raises_auth_error(self, client):
        resp = _mock_response(401, {"error": "Invalid token"})
        with pytest.raises(AuthError, match="Invalid token"):
            client._handle_response(resp)

    def test_401_default_message(self, client):
        resp = _mock_response(401)
        with pytest.raises(AuthError, match="Unauthorized"):
            client._handle_response(resp)

    def test_404_raises_not_found(self, client):
        resp = _mock_response(404, {"error": "Skill not found"})
        with pytest.raises(NotFoundError, match="Skill not found"):
            client._handle_response(resp)

    def test_404_default_message(self, client):
        resp = _mock_response(404)
        with pytest.raises(NotFoundError, match="Not found"):
            client._handle_response(resp)

    def test_429_raises_rate_limit(self, client):
        resp = _mock_response(
            429, {"error": "slow down"},
            headers={"content-type": "application/json", "Retry-After": "30"},
        )
        with pytest.raises(RateLimitError) as exc_info:
            client._handle_response(resp)
        assert exc_info.value.retry_after == 30

    def test_429_default_retry_after(self, client):
        resp = _mock_response(
            429, {"error": "slow down"},
            headers={"content-type": "application/json"},
        )
        with pytest.raises(RateLimitError) as exc_info:
            client._handle_response(resp)
        assert exc_info.value.retry_after == 60

    def test_500_raises_api_error(self, client):
        resp = _mock_response(500, {"error": "Internal error"})
        with pytest.raises(APIError) as exc_info:
            client._handle_response(resp)
        assert exc_info.value.status_code == 500

    def test_generic_4xx_raises_api_error(self, client):
        resp = _mock_response(422, {"error": "Validation failed"})
        with pytest.raises(APIError, match="Validation failed"):
            client._handle_response(resp)


class TestParseJson:
    def test_html_response_raises(self, client):
        resp = _mock_response(200, content_type="text/html")
        resp.headers = {"content-type": "text/html"}
        with pytest.raises(StrawHubError, match="HTML instead of JSON"):
            client._parse_json(resp)

    def test_invalid_json_raises(self, client):
        resp = _mock_response(200, content_type="application/json")
        resp.headers = {"content-type": "application/json"}
        resp.json.side_effect = ValueError("bad json")
        resp.text = "not json"
        with pytest.raises(StrawHubError, match="Unexpected response"):
            client._parse_json(resp)


class TestRequest:
    def test_connect_error_raises(self, client):
        client._client.request = MagicMock(side_effect=httpx.ConnectError("refused"))
        with pytest.raises(StrawHubError, match="Could not connect"):
            client._request("GET", "/api/v1/whoami")

    def test_timeout_error_raises(self, client):
        client._client.request = MagicMock(side_effect=httpx.TimeoutException("timed out"))
        with pytest.raises(StrawHubError, match="timed out"):
            client._request("GET", "/api/v1/whoami")


class TestGetInfo:
    def test_dispatches_skill(self, client):
        client.get_skill = MagicMock(return_value={"slug": "x"})
        kind, data = client.get_info("x", "skill")
        assert kind == "skill"
        client.get_skill.assert_called_once_with("x", version=None)

    def test_dispatches_agent(self, client):
        client.get_agent = MagicMock(return_value={"slug": "a"})
        kind, data = client.get_info("a", "agent")
        assert kind == "agent"

    def test_dispatches_memory(self, client):
        client.get_memory = MagicMock(return_value={"slug": "m"})
        kind, data = client.get_info("m", "memory")
        assert kind == "memory"

    def test_defaults_to_role(self, client):
        client.get_role = MagicMock(return_value={"slug": "r"})
        kind, data = client.get_info("r", "role")
        assert kind == "role"

    def test_unknown_kind_defaults_to_role(self, client):
        client.get_role = MagicMock(return_value={"slug": "r"})
        kind, data = client.get_info("r", "unknown")
        assert kind == "role"


class TestDeletePackage:
    def test_dispatches_skill(self, client):
        client.delete_skill = MagicMock(return_value={"ok": True})
        client.delete_package("x", "skill")
        client.delete_skill.assert_called_once_with("x")

    def test_dispatches_agent(self, client):
        client.delete_agent = MagicMock(return_value={"ok": True})
        client.delete_package("x", "agent")
        client.delete_agent.assert_called_once_with("x")

    def test_dispatches_memory(self, client):
        client.delete_memory = MagicMock(return_value={"ok": True})
        client.delete_package("x", "memory")
        client.delete_memory.assert_called_once_with("x")

    def test_defaults_to_role(self, client):
        client.delete_role = MagicMock(return_value={"ok": True})
        client.delete_package("x", "role")
        client.delete_role.assert_called_once_with("x")


class TestTrackDownload:
    def test_fire_and_forget_swallows_errors(self, client):
        """track_download silently ignores errors — never raises."""
        client._request = MagicMock(side_effect=Exception("network error"))
        # Should not raise
        client.track_download("skill", "my-skill", version="1.0.0")

    def test_sends_correct_payload(self, client):
        client._request = MagicMock(return_value={"ok": True})
        client.track_download("agent", "my-agent", version="2.0.0")
        client._request.assert_called_once_with(
            "POST",
            "/api/v1/downloads",
            json={"kind": "agent", "slug": "my-agent", "version": "2.0.0"},
        )

    def test_omits_version_when_none(self, client):
        client._request = MagicMock(return_value={"ok": True})
        client.track_download("skill", "my-skill")
        client._request.assert_called_once_with(
            "POST",
            "/api/v1/downloads",
            json={"kind": "skill", "slug": "my-skill"},
        )


class TestContextManager:
    def test_context_manager(self):
        with patch("strawhub.client.get_api_url", return_value="https://fake.test"):
            with patch("strawhub.client.get_token", return_value="t"):
                with StrawHubClient() as c:
                    assert c.api_url == "https://fake.test"
