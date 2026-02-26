"""Tests for the publish command."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from click.testing import CliRunner

from strawhub.cli import cli


def test_publish_auto_detects_skill(tmp_path, monkeypatch):
    """Publish auto-detects kind from SKILL.md."""
    skill_dir = tmp_path / "my-skill"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: my-skill\nversion: 1.0.0\ndescription: A test skill\n---\n\n# My Skill\n"
    )

    mock_client = MagicMock()
    mock_client.token = "sh_test"
    mock_client.publish_skill.return_value = {"version": "1.0.0"}
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("strawhub.commands.publish.StrawHubClient", return_value=mock_client):
        runner = CliRunner()
        result = runner.invoke(cli, ["publish", str(skill_dir), "--changelog", "Initial"])

    assert result.exit_code == 0
    assert "Published" in result.output
    mock_client.publish_skill.assert_called_once()
    call_args = mock_client.publish_skill.call_args
    assert call_args[0][0]["slug"] == "my-skill"
    assert call_args[0][0]["version"] == "1.0.0"


def test_publish_auto_detects_role(tmp_path, monkeypatch):
    """Publish auto-detects kind from ROLE.md."""
    role_dir = tmp_path / "my-role"
    role_dir.mkdir()
    (role_dir / "ROLE.md").write_text(
        "---\nname: my-role\nversion: 1.0.0\n---\n\n# My Role\n"
    )

    mock_client = MagicMock()
    mock_client.token = "sh_test"
    mock_client.publish_role.return_value = {"version": "1.0.0"}
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("strawhub.commands.publish.StrawHubClient", return_value=mock_client):
        runner = CliRunner()
        result = runner.invoke(cli, ["publish", str(role_dir), "--changelog", "Initial"])

    assert result.exit_code == 0
    mock_client.publish_role.assert_called_once()


def test_publish_no_main_file(tmp_path):
    """Publish fails if no SKILL.md or ROLE.md found."""
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()

    runner = CliRunner()
    result = runner.invoke(cli, ["publish", str(empty_dir)])
    assert result.exit_code == 1
    assert "No SKILL.md or ROLE.md" in result.output


def test_publish_missing_slug(tmp_path):
    """Publish fails if frontmatter has no name/slug."""
    skill_dir = tmp_path / "no-slug"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text("---\ndescription: No slug\n---\n\n# No Slug\n")

    mock_client = MagicMock()
    mock_client.token = "sh_test"
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("strawhub.commands.publish.StrawHubClient", return_value=mock_client):
        runner = CliRunner()
        result = runner.invoke(cli, ["publish", str(skill_dir)])

    assert result.exit_code == 1
    assert "Missing" in result.output


def test_publish_missing_version(tmp_path):
    """Publish fails if no version in frontmatter or --version."""
    skill_dir = tmp_path / "no-ver"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text("---\nname: no-ver\n---\n\n# No Ver\n")

    mock_client = MagicMock()
    mock_client.token = "sh_test"
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("strawhub.commands.publish.StrawHubClient", return_value=mock_client):
        runner = CliRunner()
        result = runner.invoke(cli, ["publish", str(skill_dir)])

    assert result.exit_code == 1
    assert "Version is required" in result.output


def test_publish_skips_dotfiles(tmp_path):
    """Publish skips hidden files and directories."""
    skill_dir = tmp_path / "dotfiles"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text("---\nname: dotfiles\nversion: 1.0.0\n---\n\n# Test\n")
    (skill_dir / ".hidden").write_text("secret")
    git_dir = skill_dir / ".git"
    git_dir.mkdir()
    (git_dir / "config").write_text("git config")

    mock_client = MagicMock()
    mock_client.token = "sh_test"
    mock_client.publish_skill.return_value = {"version": "1.0.0"}
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("strawhub.commands.publish.StrawHubClient", return_value=mock_client):
        runner = CliRunner()
        result = runner.invoke(cli, ["publish", str(skill_dir), "--changelog", "test"])

    assert result.exit_code == 0
    call_args = mock_client.publish_skill.call_args
    file_names = [f[1][0] for f in call_args[0][1]]
    assert ".hidden" not in file_names
    assert ".git/config" not in file_names
    assert "SKILL.md" in file_names


def test_publish_uses_forward_slash_paths(tmp_path):
    """Publish uses forward slashes in file paths, even on Windows."""
    skill_dir = tmp_path / "nested"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: nested\nversion: 1.0.0\n---\n\n# Nested\n"
    )
    sub = skill_dir / "prompts" / "deep"
    sub.mkdir(parents=True)
    (sub / "task.md").write_text("# Task prompt")

    mock_client = MagicMock()
    mock_client.token = "sh_test"
    mock_client.publish_skill.return_value = {"version": "1.0.0"}
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("strawhub.commands.publish.StrawHubClient", return_value=mock_client):
        runner = CliRunner()
        result = runner.invoke(cli, ["publish", str(skill_dir)])

    assert result.exit_code == 0
    call_args = mock_client.publish_skill.call_args
    file_names = [f[1][0] for f in call_args[0][1]]
    assert "prompts/deep/task.md" in file_names
    # Ensure no backslashes in any path
    for name in file_names:
        assert "\\" not in name, f"Backslash found in file path: {name}"


def test_publish_not_logged_in(tmp_path):
    """Publish fails if not logged in."""
    skill_dir = tmp_path / "skill"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text("---\nname: skill\nversion: 1.0.0\n---\n\n# Skill\n")

    mock_client = MagicMock()
    mock_client.token = None
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("strawhub.commands.publish.StrawHubClient", return_value=mock_client):
        runner = CliRunner()
        result = runner.invoke(cli, ["publish", str(skill_dir)])

    assert result.exit_code == 1
    assert "Not logged in" in result.output
