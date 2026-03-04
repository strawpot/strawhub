"""Tests for strawhub.commands.install helpers."""

from unittest.mock import MagicMock

from strawhub.commands.install import _resolve_deps


class TestResolveDepsWildcard:
    def test_filters_wildcard_from_role_deps(self):
        """'*' slug returned by server is filtered out."""
        client = MagicMock()
        client.resolve_role_deps.return_value = {
            "dependencies": [
                {"slug": "reviewer", "version": "1.0.0"},
                {"slug": "*"},
                {"slug": "implementer", "version": "1.0.0"},
            ],
        }
        result = _resolve_deps(client, "role", "lead", {})
        slugs = [d["slug"] for d in result]
        assert "*" not in slugs
        assert slugs == ["reviewer", "implementer"]

    def test_no_wildcard_passes_through(self):
        """Normal deps pass through unchanged."""
        client = MagicMock()
        client.resolve_role_deps.return_value = {
            "dependencies": [
                {"slug": "reviewer", "version": "1.0.0"},
            ],
        }
        result = _resolve_deps(client, "role", "lead", {})
        assert len(result) == 1
        assert result[0]["slug"] == "reviewer"
