"""Tests for paths.py — .strawpot path resolution."""

import os
from pathlib import Path

from strawhub.paths import (
    find_installed_versions,
    get_global_root,
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
        result = get_package_dir(tmp_path, "skill", "git-workflow", "1.0.0")
        assert result == tmp_path / "skills" / "git-workflow-1.0.0"

    def test_role(self, tmp_path):
        result = get_package_dir(tmp_path, "role", "implementer", "2.1.0")
        assert result == tmp_path / "roles" / "implementer-2.1.0"


class TestGetLockfilePath:
    def test_path(self, tmp_path):
        assert get_lockfile_path(tmp_path) == tmp_path / "strawpot.lock"


class TestPackageExists:
    def test_exists(self, tmp_path):
        d = tmp_path / "skills" / "git-workflow-1.0.0"
        d.mkdir(parents=True)
        assert package_exists(tmp_path, "skill", "git-workflow", "1.0.0") is True

    def test_not_exists(self, tmp_path):
        assert package_exists(tmp_path, "skill", "git-workflow", "1.0.0") is False


class TestFindInstalledVersions:
    def test_multiple_versions(self, tmp_path):
        skills = tmp_path / "skills"
        (skills / "git-workflow-1.0.0").mkdir(parents=True)
        (skills / "git-workflow-1.4.0").mkdir(parents=True)
        (skills / "git-workflow-2.0.0").mkdir(parents=True)
        (skills / "other-skill-1.0.0").mkdir(parents=True)

        versions = find_installed_versions(tmp_path, "skill", "git-workflow")
        assert sorted(versions) == ["1.0.0", "1.4.0", "2.0.0"]

    def test_no_versions(self, tmp_path):
        (tmp_path / "skills").mkdir(parents=True)
        versions = find_installed_versions(tmp_path, "skill", "nonexistent")
        assert versions == []

    def test_no_directory(self, tmp_path):
        versions = find_installed_versions(tmp_path, "skill", "anything")
        assert versions == []

    def test_ignores_files(self, tmp_path):
        skills = tmp_path / "skills"
        skills.mkdir(parents=True)
        (skills / "git-workflow-1.0.0").mkdir()
        (skills / "git-workflow-1.0.0.bak").touch()  # file, not dir
        versions = find_installed_versions(tmp_path, "skill", "git-workflow")
        assert versions == ["1.0.0"]
