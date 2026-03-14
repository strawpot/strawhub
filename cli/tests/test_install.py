"""Tests for strawhub.commands.install helpers."""

from unittest.mock import MagicMock, patch

import pytest

from strawhub.commands.install import (
    _resolve_deps,
    _slug_installed_in_scope,
    _download_package,
)


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

    def test_skill_uses_server_resolve(self):
        """Skills use server-side /resolve endpoint."""
        client = MagicMock()
        client.resolve_skill_deps.return_value = {
            "dependencies": [
                {"slug": "git-workflow", "kind": "skill", "version": "1.0.0"},
                {"slug": "code-review", "kind": "skill", "version": "2.0.0"},
            ],
        }
        result = _resolve_deps(client, "skill", "my-skill", {})
        client.resolve_skill_deps.assert_called_once_with("my-skill")
        assert len(result) == 2
        assert result[0]["slug"] == "git-workflow"

    def test_agents_have_no_deps(self):
        """Agents are standalone — resolve returns empty list."""
        client = MagicMock()
        result = _resolve_deps(client, "agent", "my-agent", {})
        assert result == []
        client.resolve_skill_deps.assert_not_called()
        client.resolve_role_deps.assert_not_called()

    def test_memories_have_no_deps(self):
        """Memories are standalone — resolve returns empty list."""
        client = MagicMock()
        result = _resolve_deps(client, "memory", "my-mem", {})
        assert result == []


class TestSlugInstalledInScope:
    def test_returns_version_when_installed(self, tmp_path):
        root = tmp_path
        pkg_dir = root / "skills" / "foo"
        pkg_dir.mkdir(parents=True)
        (pkg_dir / ".version").write_text("1.2.3\n")
        result = _slug_installed_in_scope(root, "skill", "foo")
        assert result == "1.2.3"

    def test_returns_none_when_not_installed(self, tmp_path):
        result = _slug_installed_in_scope(tmp_path, "skill", "nonexistent")
        assert result is None


class TestDownloadPackage:
    def test_writes_files_and_version(self, tmp_path):
        """Downloads files, writes them to disk, and creates .version marker."""
        client = MagicMock()
        client.get_info.return_value = (
            "skill",
            {
                "latestVersion": {
                    "version": "1.0.0",
                    "files": [
                        {"path": "SKILL.md"},
                        {"path": "examples/demo.md"},
                    ],
                },
            },
        )
        client.get_skill_file.side_effect = [
            "# Skill content",
            "# Demo",
        ]
        client.track_download = MagicMock()

        _download_package(client, "skill", "my-skill", "1.0.0", tmp_path)

        assert (tmp_path / "skills" / "my-skill" / "SKILL.md").read_text() == "# Skill content"
        assert (tmp_path / "skills" / "my-skill" / "examples" / "demo.md").read_text() == "# Demo"
        assert (tmp_path / "skills" / "my-skill" / ".version").read_text().strip() == "1.0.0"
        client.track_download.assert_called_once_with("skill", "my-skill", version="1.0.0")

    def test_agent_uses_binary_download(self, tmp_path):
        """Agents use get_agent_file (binary) instead of get_skill_file (text)."""
        client = MagicMock()
        client.get_info.return_value = (
            "agent",
            {
                "latestVersion": {
                    "version": "0.1.0",
                    "files": [{"path": "AGENT.md"}],
                },
            },
        )
        client.get_agent_file.return_value = b"binary content"
        client.track_download = MagicMock()

        _download_package(client, "agent", "my-agent", "0.1.0", tmp_path)

        assert (tmp_path / "agents" / "my-agent" / "AGENT.md").read_bytes() == b"binary content"
        client.get_agent_file.assert_called_once()
