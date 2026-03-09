"""Tests for the --root CLI option."""

from pathlib import Path

from strawhub.paths import get_local_root, get_project_file_path, set_local_root


class TestSetLocalRoot:
    def teardown_method(self):
        set_local_root(None)

    def test_override_local_root(self, tmp_path):
        override = tmp_path / ".strawpot"
        set_local_root(override)
        assert get_local_root() == override

    def test_override_project_file_path(self, tmp_path):
        override = tmp_path / ".strawpot"
        set_local_root(override)
        assert get_project_file_path() == tmp_path / "strawpot.toml"

    def test_reset_clears_override(self, tmp_path):
        set_local_root(tmp_path / ".strawpot")
        set_local_root(None)
        assert get_local_root() == Path.cwd() / ".strawpot"
        assert get_project_file_path() == Path.cwd() / "strawpot.toml"

    def test_default_without_override(self):
        assert get_local_root() == Path.cwd() / ".strawpot"
        assert get_project_file_path() == Path.cwd() / "strawpot.toml"
