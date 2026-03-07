"""Tests for strawhub.config module."""

import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from strawhub.config import (
    load_config,
    save_config,
    get_token,
    set_token,
    get_api_url,
    DEFAULT_API_URL,
)


@pytest.fixture
def config_dir(tmp_path):
    """Patch CONFIG_DIR and CONFIG_FILE to use a temp directory."""
    cfg_dir = tmp_path / "config"
    cfg_file = cfg_dir / "config.json"
    with patch("strawhub.config.CONFIG_DIR", cfg_dir), \
         patch("strawhub.config.CONFIG_FILE", cfg_file):
        yield cfg_dir, cfg_file


class TestLoadConfig:
    def test_returns_empty_dict_when_no_file(self, config_dir):
        assert load_config() == {}

    def test_reads_existing_config(self, config_dir):
        cfg_dir, cfg_file = config_dir
        cfg_dir.mkdir(parents=True)
        cfg_file.write_text(json.dumps({"token": "abc123"}))
        assert load_config() == {"token": "abc123"}


class TestSaveConfig:
    def test_creates_dir_and_writes_json(self, config_dir):
        cfg_dir, cfg_file = config_dir
        save_config({"token": "xyz"})
        assert cfg_dir.exists()
        data = json.loads(cfg_file.read_text())
        assert data == {"token": "xyz"}

    def test_overwrites_existing(self, config_dir):
        cfg_dir, cfg_file = config_dir
        save_config({"token": "first"})
        save_config({"token": "second"})
        data = json.loads(cfg_file.read_text())
        assert data["token"] == "second"


class TestGetToken:
    def test_env_var_takes_priority(self, config_dir, monkeypatch):
        cfg_dir, cfg_file = config_dir
        cfg_dir.mkdir(parents=True)
        cfg_file.write_text(json.dumps({"token": "file-token"}))
        monkeypatch.setenv("STRAWHUB_TOKEN", "env-token")
        assert get_token() == "env-token"

    def test_falls_back_to_config_file(self, config_dir, monkeypatch):
        cfg_dir, cfg_file = config_dir
        cfg_dir.mkdir(parents=True)
        cfg_file.write_text(json.dumps({"token": "file-token"}))
        monkeypatch.delenv("STRAWHUB_TOKEN", raising=False)
        assert get_token() == "file-token"

    def test_returns_none_when_no_token(self, config_dir, monkeypatch):
        monkeypatch.delenv("STRAWHUB_TOKEN", raising=False)
        assert get_token() is None


class TestSetToken:
    def test_saves_token_to_config(self, config_dir):
        set_token("new-token")
        _, cfg_file = config_dir
        data = json.loads(cfg_file.read_text())
        assert data["token"] == "new-token"

    def test_preserves_other_keys(self, config_dir):
        save_config({"api_url": "https://custom.test", "token": "old"})
        set_token("new-token")
        _, cfg_file = config_dir
        data = json.loads(cfg_file.read_text())
        assert data["token"] == "new-token"
        assert data["api_url"] == "https://custom.test"


class TestGetApiUrl:
    def test_env_var_takes_priority(self, config_dir, monkeypatch):
        monkeypatch.setenv("STRAWHUB_API_URL", "https://env.test/")
        assert get_api_url() == "https://env.test"

    def test_strips_trailing_slash(self, config_dir, monkeypatch):
        monkeypatch.setenv("STRAWHUB_API_URL", "https://env.test///")
        assert get_api_url() == "https://env.test"

    def test_falls_back_to_config_file(self, config_dir, monkeypatch):
        monkeypatch.delenv("STRAWHUB_API_URL", raising=False)
        save_config({"api_url": "https://custom.test"})
        assert get_api_url() == "https://custom.test"

    def test_defaults_to_production(self, config_dir, monkeypatch):
        monkeypatch.delenv("STRAWHUB_API_URL", raising=False)
        assert get_api_url() == DEFAULT_API_URL
