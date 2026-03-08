"""Tests for paths.py — .strawpot path resolution."""

import os
from pathlib import Path

from strawhub.paths import (
    find_installed_versions,
    get_global_root,
    get_installed_version,
    get_lockfile_path,
    get_package_dir,
    package_exists,
)


class TestGetGlobalRoot:
    def test_default(self, monkeypatch):
        monkeypatch.delenv("STRAWPOT_HOME", raising=False)
        assert get_global_root() == Path.home() / ".strawpot"

    def test_env_override(self, monkeypatch):
        monkeypatch.setenv("STRAWPOT_HOME", "/custom/path")
        assert get_global_root() == Path("/custom/path")


class TestGetPackageDir:
    def test_skill(self, tmp_path):
        result = get_package_dir(tmp_path, "skill", "git-workflow")
        assert result == tmp_path / "skills" / "git-workflow"

    def test_role(self, tmp_path):
        result = get_package_dir(tmp_path, "role", "implementer")
        assert result == tmp_path / "roles" / "implementer"


class TestGetLockfilePath:
    def test_path(self, tmp_path):
        assert get_lockfile_path(tmp_path) == tmp_path / "strawpot.lock"


class TestPackageExists:
    def test_exists(self, tmp_path):
        d = tmp_path / "skills" / "git-workflow"
        d.mkdir(parents=True)
        assert package_exists(tmp_path, "skill", "git-workflow") is True

    def test_not_exists(self, tmp_path):
        assert package_exists(tmp_path, "skill", "git-workflow") is False


class TestGetInstalledVersion:
    def test_has_version(self, tmp_path):
        pkg = tmp_path / "skills" / "git-workflow"
        pkg.mkdir(parents=True)
        (pkg / ".version").write_text("1.2.3\n")
        assert get_installed_version(tmp_path, "skill", "git-workflow") == "1.2.3"

    def test_no_version_file(self, tmp_path):
        pkg = tmp_path / "skills" / "git-workflow"
        pkg.mkdir(parents=True)
        assert get_installed_version(tmp_path, "skill", "git-workflow") is None

    def test_no_dir(self, tmp_path):
        assert get_installed_version(tmp_path, "skill", "git-workflow") is None


class TestFindInstalledVersions:
    def test_installed(self, tmp_path):
        pkg = tmp_path / "skills" / "git-workflow"
        pkg.mkdir(parents=True)
        (pkg / ".version").write_text("2.0.0\n")

        versions = find_installed_versions(tmp_path, "skill", "git-workflow")
        assert versions == ["2.0.0"]

    def test_no_version_file(self, tmp_path):
        pkg = tmp_path / "skills" / "git-workflow"
        pkg.mkdir(parents=True)
        versions = find_installed_versions(tmp_path, "skill", "git-workflow")
        assert versions == []

    def test_not_installed(self, tmp_path):
        (tmp_path / "skills").mkdir(parents=True)
        versions = find_installed_versions(tmp_path, "skill", "nonexistent")
        assert versions == []

    def test_no_directory(self, tmp_path):
        versions = find_installed_versions(tmp_path, "skill", "anything")
        assert versions == []
