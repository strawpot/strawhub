"""Tests for strawhub.commands.uninstall."""

from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from strawhub.cli import cli
from strawhub.commands.uninstall import _find_targets, _uninstall_impl
from strawhub.lockfile import Lockfile, PackageRef


class TestFindTargets:
    def test_finds_matching_direct_install(self):
        """Matches by slug and kind."""
        lockfile = Lockfile.__new__(Lockfile)
        lockfile.direct_installs = [
            PackageRef(kind="skill", slug="foo", version="1.0.0"),
            PackageRef(kind="skill", slug="bar", version="2.0.0"),
        ]
        targets = _find_targets(lockfile, "foo", "skill", None)
        assert len(targets) == 1
        assert targets[0].slug == "foo"
        assert targets[0].kind == "skill"

    def test_returns_empty_for_unknown_slug(self):
        """No match returns an empty list."""
        lockfile = Lockfile.__new__(Lockfile)
        lockfile.direct_installs = [
            PackageRef(kind="skill", slug="bar", version="1.0.0"),
        ]
        targets = _find_targets(lockfile, "nonexistent", "skill", None)
        assert targets == []

    def test_filters_by_version_when_provided(self):
        """--version narrows results to exact version match."""
        lockfile = Lockfile.__new__(Lockfile)
        lockfile.direct_installs = [
            PackageRef(kind="skill", slug="foo", version="1.0.0"),
            PackageRef(kind="skill", slug="foo", version="2.0.0"),
        ]
        targets = _find_targets(lockfile, "foo", "skill", "2.0.0")
        assert len(targets) == 1
        assert targets[0].version == "2.0.0"

    def test_returns_all_versions_when_no_version_filter(self):
        """Without --version, returns all matching versions."""
        lockfile = Lockfile.__new__(Lockfile)
        lockfile.direct_installs = [
            PackageRef(kind="skill", slug="foo", version="1.0.0"),
            PackageRef(kind="skill", slug="foo", version="2.0.0"),
            PackageRef(kind="skill", slug="foo", version="3.0.0"),
        ]
        targets = _find_targets(lockfile, "foo", "skill", None)
        assert len(targets) == 3
        versions = {t.version for t in targets}
        assert versions == {"1.0.0", "2.0.0", "3.0.0"}


class TestUninstallImpl:
    def test_removes_direct_install_and_cleans_orphans(self, tmp_path):
        """Mock lockfile, verify direct install removed and orphan cleanup runs."""
        mock_lockfile = MagicMock(spec=Lockfile)
        ref = PackageRef(kind="skill", slug="my-skill", version="1.0.0")
        mock_lockfile.direct_installs = [ref]
        mock_lockfile.packages = {"skill:my-skill:1.0.0": {
            "kind": "skill", "slug": "my-skill", "version": "1.0.0",
            "dependents": [],
        }}
        mock_lockfile.collect_orphans.return_value = []

        with patch("strawhub.commands.uninstall.get_root", return_value=tmp_path), \
             patch("strawhub.commands.uninstall.get_lockfile_path", return_value=tmp_path / "strawpot.lock"), \
             patch("strawhub.commands.uninstall.Lockfile.load", return_value=mock_lockfile), \
             patch("strawhub.commands.uninstall._find_targets", return_value=[ref]):
            _uninstall_impl("my-skill", kind="skill", ver=None, is_global=False)

        mock_lockfile.remove_direct_install.assert_called_once_with(ref)
        mock_lockfile.collect_orphans.assert_called_once()
        mock_lockfile.save.assert_called_once()

    def test_errors_when_not_direct_install(self, tmp_path):
        """Exits 1 when slug is not in direct_installs."""
        mock_lockfile = MagicMock(spec=Lockfile)
        mock_lockfile.packages = {"skill:dep:1.0.0": {
            "kind": "skill", "slug": "dep", "version": "1.0.0",
            "dependents": [],
        }}
        mock_lockfile.direct_installs = []

        with patch("strawhub.commands.uninstall.get_root", return_value=tmp_path), \
             patch("strawhub.commands.uninstall.get_lockfile_path", return_value=tmp_path / "strawpot.lock"), \
             patch("strawhub.commands.uninstall.Lockfile.load", return_value=mock_lockfile), \
             patch("strawhub.commands.uninstall._find_targets", return_value=[]):
            with pytest.raises(SystemExit) as exc_info:
                _uninstall_impl("dep", kind="skill", ver=None, is_global=False)
            assert exc_info.value.code == 1

    def test_integration_always_global(self):
        """Verify uninstall integration uses is_global=True."""
        runner = CliRunner()
        with patch("strawhub.commands.uninstall._uninstall_impl") as mock_impl:
            result = runner.invoke(cli, ["uninstall", "integration", "test-slug"])

        mock_impl.assert_called_once()
        call_kwargs = mock_impl.call_args
        assert call_kwargs.kwargs.get("is_global") is True or (
            len(call_kwargs.args) > 3 and call_kwargs.args[3] is True
        )

    def test_save_removes_from_toml(self, tmp_path):
        """Verify --save calls ProjectFile.remove_dependency."""
        mock_lockfile = MagicMock(spec=Lockfile)
        ref = PackageRef(kind="skill", slug="my-skill", version="1.0.0")
        mock_lockfile.direct_installs = [ref]
        mock_lockfile.packages = {"skill:my-skill:1.0.0": {
            "kind": "skill", "slug": "my-skill", "version": "1.0.0",
            "dependents": [],
        }}
        mock_lockfile.collect_orphans.return_value = []

        mock_pf = MagicMock()
        mock_pf.remove_dependency.return_value = True

        with patch("strawhub.commands.uninstall.get_root", return_value=tmp_path), \
             patch("strawhub.commands.uninstall.get_lockfile_path", return_value=tmp_path / "strawpot.lock"), \
             patch("strawhub.commands.uninstall.Lockfile.load", return_value=mock_lockfile), \
             patch("strawhub.commands.uninstall._find_targets", return_value=[ref]), \
             patch("strawhub.commands.uninstall.get_project_file_path", return_value=tmp_path / "strawpot.toml"), \
             patch("strawhub.commands.uninstall.ProjectFile.load", return_value=mock_pf):
            _uninstall_impl("my-skill", kind="skill", ver=None, is_global=False, save=True)

        mock_pf.remove_dependency.assert_called_once_with("skill", "my-skill")
        mock_pf.save.assert_called_once()

    def test_save_and_global_conflict(self):
        """--save and --global cannot be used together; exits 1."""
        with pytest.raises(SystemExit) as exc_info:
            _uninstall_impl("x", kind="skill", ver=None, is_global=True, save=True)
        assert exc_info.value.code == 1
