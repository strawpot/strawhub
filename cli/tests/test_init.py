"""Tests for strawhub.commands.init."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from strawhub.cli import cli
from strawhub.lockfile import Lockfile, PackageRef


@pytest.fixture
def mock_lockfile_with_packages():
    """Return a mock Lockfile with two direct installs."""
    lf = MagicMock(spec=Lockfile)
    lf.direct_installs = [
        PackageRef(kind="skill", slug="git-workflow", version="1.2.0"),
        PackageRef(kind="role", slug="reviewer", version="3.0.0"),
    ]
    return lf


def _run_init(tmp_path, args=None, lockfile=None, toml_exists=False):
    """Helper to invoke `init` with standard patches."""
    if args is None:
        args = []
    toml_path = tmp_path / "strawpot.toml"
    if toml_exists:
        toml_path.write_text('[skills]\ngit-workflow = "*"\n')
    lock_path = tmp_path / ".strawpot" / "strawpot.lock"
    root = tmp_path / ".strawpot"

    runner = CliRunner()
    with patch("strawhub.commands.init.get_project_file_path", return_value=toml_path), \
         patch("strawhub.commands.init.get_local_root", return_value=root), \
         patch("strawhub.commands.init.get_lockfile_path", return_value=lock_path), \
         patch("strawhub.commands.init.Lockfile.load", return_value=lockfile):
        result = runner.invoke(cli, ["init"] + args)
    return result, toml_path


class TestInit:
    def test_init_creates_toml_from_lockfile(self, tmp_path, mock_lockfile_with_packages):
        """Creates strawpot.toml with wildcard constraints."""
        result, toml_path = _run_init(
            tmp_path, lockfile=mock_lockfile_with_packages
        )
        assert result.exit_code == 0
        content = toml_path.read_text()
        assert 'git-workflow = "*"' in content
        assert 'reviewer = "*"' in content

    def test_init_exact_uses_pinned_versions(self, tmp_path, mock_lockfile_with_packages):
        """--exact flag uses ==X.Y.Z constraints."""
        result, toml_path = _run_init(
            tmp_path, args=["--exact"], lockfile=mock_lockfile_with_packages
        )
        assert result.exit_code == 0
        content = toml_path.read_text()
        assert 'git-workflow = "==1.2.0"' in content
        assert 'reviewer = "==3.0.0"' in content

    def test_init_refuses_overwrite_without_force(self, tmp_path, mock_lockfile_with_packages):
        """Exits 1 if strawpot.toml already exists and --force is not given."""
        result, _ = _run_init(
            tmp_path, lockfile=mock_lockfile_with_packages, toml_exists=True
        )
        assert result.exit_code == 1
        assert "already exists" in result.output

    def test_init_force_overwrites(self, tmp_path, mock_lockfile_with_packages):
        """--force overwrites an existing strawpot.toml."""
        result, toml_path = _run_init(
            tmp_path,
            args=["--force"],
            lockfile=mock_lockfile_with_packages,
            toml_exists=True,
        )
        assert result.exit_code == 0
        content = toml_path.read_text()
        assert 'git-workflow = "*"' in content

    def test_init_no_packages_errors(self, tmp_path):
        """Exits 1 when there are no direct_installs."""
        empty_lockfile = MagicMock(spec=Lockfile)
        empty_lockfile.direct_installs = []

        result, _ = _run_init(tmp_path, lockfile=empty_lockfile)
        assert result.exit_code == 1
        assert "No local packages installed" in result.output
