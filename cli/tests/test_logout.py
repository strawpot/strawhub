"""Tests for the logout command and config path."""

import json
from pathlib import Path

from click.testing import CliRunner

from strawhub.cli import cli


def test_config_dir_uses_platformdirs():
    """CONFIG_DIR is derived from platformdirs, not hardcoded ~/.config/."""
    from platformdirs import user_config_dir
    from strawhub.config import CONFIG_DIR

    expected = Path(user_config_dir("strawhub"))
    assert CONFIG_DIR == expected


def test_logout_removes_token(tmp_path, monkeypatch):
    """Logout removes the token from config."""
    config_dir = tmp_path / "config"
    config_file = config_dir / "config.json"
    config_dir.mkdir()
    config_file.write_text(json.dumps({"token": "sh_test123"}))

    monkeypatch.setattr("strawhub.config.CONFIG_DIR", config_dir)
    monkeypatch.setattr("strawhub.config.CONFIG_FILE", config_file)
    monkeypatch.setattr("strawhub.commands.logout.load_config", lambda: {"token": "sh_test123"})

    saved = {}

    def fake_save(config):
        saved.update(config)

    monkeypatch.setattr("strawhub.commands.logout.save_config", fake_save)

    runner = CliRunner()
    result = runner.invoke(cli, ["logout"])
    assert result.exit_code == 0
    assert "token" not in saved


def test_logout_not_logged_in(tmp_path, monkeypatch):
    """Logout fails when no token is stored."""
    monkeypatch.setattr("strawhub.commands.logout.load_config", lambda: {})

    runner = CliRunner()
    result = runner.invoke(cli, ["logout"])
    assert result.exit_code == 1
    assert "Not logged in" in result.output
