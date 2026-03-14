"""Tests for strawhub.commands.uninstall."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from strawhub.commands.uninstall import _find_targets, _uninstall_impl
from strawhub.lockfile import Lockfile, PackageRef
from strawhub.paths import get_package_dir


@pytest.fixture
def setup_installed(tmp_path):
    """Create a .strawpot directory with installed packages and a lockfile."""
    root = tmp_path / ".strawpot"
    (root / "skills").mkdir(parents=True)
    (root / "roles").mkdir(parents=True)

    def _setup(packages, direct_installs=None, dependents=None):
        lockfile = Lockfile(path=root / "strawpot.lock")
        for pkg in packages:
            ref = PackageRef(**pkg)
            pkg_dir = get_package_dir(root, pkg["kind"], pkg["slug"])
            pkg_dir.mkdir(parents=True, exist_ok=True)
            md_name = f"{pkg['kind'].upper()}.md"
            (pkg_dir / md_name).write_text(f"---\nname: {pkg['slug']}\n---\n")
            (pkg_dir / ".version").write_text(pkg["version"] + "\n")
            lockfile.add_package(ref)

        for ref_dict in (direct_installs or []):
            lockfile.add_direct_install(PackageRef(**ref_dict))

        if dependents:
            for dep_key, parent_ref_dict in dependents:
                parent_ref = PackageRef(**parent_ref_dict)
                pkg_dict = next(
                    p for p in packages
                    if f"{p['kind']}:{p['slug']}" == dep_key
                )
                dep_ref = PackageRef(**pkg_dict)
                lockfile.add_package(dep_ref, dependent=parent_ref)

        lockfile.save()
        return root, lockfile

    return _setup


class TestFindTargets:
    def test_finds_matching_direct_install(self):
        lockfile = Lockfile.__new__(Lockfile)
        lockfile.direct_installs = [
            PackageRef(kind="skill", slug="foo", version="1.0.0"),
            PackageRef(kind="skill", slug="bar", version="2.0.0"),
        ]
        targets = _find_targets(lockfile, "foo", "skill", None)
        assert len(targets) == 1
        assert targets[0].slug == "foo"

    def test_filters_by_kind(self):
        lockfile = Lockfile.__new__(Lockfile)
        lockfile.direct_installs = [
            PackageRef(kind="skill", slug="foo", version="1.0.0"),
            PackageRef(kind="role", slug="foo", version="1.0.0"),
        ]
        targets = _find_targets(lockfile, "foo", "role", None)
        assert len(targets) == 1
        assert targets[0].kind == "role"

    def test_filters_by_version(self):
        lockfile = Lockfile.__new__(Lockfile)
        lockfile.direct_installs = [
            PackageRef(kind="skill", slug="foo", version="1.0.0"),
        ]
        targets = _find_targets(lockfile, "foo", "skill", "2.0.0")
        assert len(targets) == 0

    def test_returns_empty_for_no_match(self):
        lockfile = Lockfile.__new__(Lockfile)
        lockfile.direct_installs = [
            PackageRef(kind="skill", slug="bar", version="1.0.0"),
        ]
        targets = _find_targets(lockfile, "foo", "skill", None)
        assert len(targets) == 0


class TestUninstallImpl:
    @patch("strawhub.commands.uninstall.get_root")
    @patch("strawhub.commands.uninstall.get_lockfile_path")
    def test_removes_package_from_disk_and_lockfile(
        self, mock_lockfile_path, mock_get_root, setup_installed
    ):
        packages = [
            {"kind": "skill", "slug": "my-skill", "version": "1.0.0"},
        ]
        root, _ = setup_installed(
            packages, direct_installs=packages
        )
        mock_get_root.return_value = root
        mock_lockfile_path.return_value = root / "strawpot.lock"

        _uninstall_impl("my-skill", kind="skill", ver=None, is_global=False)

        pkg_dir = get_package_dir(root, "skill", "my-skill")
        assert not pkg_dir.exists()

        lockfile = Lockfile.load(root / "strawpot.lock")
        assert len(lockfile.packages) == 0
        assert len(lockfile.direct_installs) == 0

    @patch("strawhub.commands.uninstall.get_root")
    @patch("strawhub.commands.uninstall.get_lockfile_path")
    def test_error_when_not_direct_install(
        self, mock_lockfile_path, mock_get_root, setup_installed
    ):
        packages = [
            {"kind": "skill", "slug": "dep-skill", "version": "1.0.0"},
        ]
        # Package exists but is NOT a direct install
        root, _ = setup_installed(packages, direct_installs=[])
        mock_get_root.return_value = root
        mock_lockfile_path.return_value = root / "strawpot.lock"

        with pytest.raises(SystemExit):
            _uninstall_impl("dep-skill", kind="skill", ver=None, is_global=False)

    @patch("strawhub.commands.uninstall.get_root")
    @patch("strawhub.commands.uninstall.get_lockfile_path")
    def test_error_when_lockfile_empty(
        self, mock_lockfile_path, mock_get_root, setup_installed
    ):
        root, _ = setup_installed([], direct_installs=[])
        mock_get_root.return_value = root
        mock_lockfile_path.return_value = root / "strawpot.lock"

        with pytest.raises(SystemExit):
            _uninstall_impl("anything", kind="skill", ver=None, is_global=False)

    @patch("strawhub.commands.uninstall.get_root")
    @patch("strawhub.commands.uninstall.get_lockfile_path")
    def test_orphan_deps_removed(
        self, mock_lockfile_path, mock_get_root, setup_installed
    ):
        """When removing a package, its orphaned dependencies are also cleaned up."""
        parent = {"kind": "skill", "slug": "parent", "version": "1.0.0"}
        child = {"kind": "skill", "slug": "child", "version": "1.0.0"}

        root, _ = setup_installed(
            [parent, child],
            direct_installs=[parent],
            dependents=[("skill:child", parent)],
        )
        mock_get_root.return_value = root
        mock_lockfile_path.return_value = root / "strawpot.lock"

        _uninstall_impl("parent", kind="skill", ver=None, is_global=False)

        # Both parent and orphaned child should be removed
        assert not get_package_dir(root, "skill", "parent").exists()
        assert not get_package_dir(root, "skill", "child").exists()

        lockfile = Lockfile.load(root / "strawpot.lock")
        assert len(lockfile.packages) == 0

    @patch("strawhub.commands.uninstall.get_root")
    @patch("strawhub.commands.uninstall.get_lockfile_path")
    def test_shared_dep_not_removed(
        self, mock_lockfile_path, mock_get_root, setup_installed
    ):
        """A dependency shared by another direct install is NOT orphaned."""
        parent1 = {"kind": "skill", "slug": "parent1", "version": "1.0.0"}
        parent2 = {"kind": "skill", "slug": "parent2", "version": "1.0.0"}
        shared = {"kind": "skill", "slug": "shared", "version": "1.0.0"}

        root, _ = setup_installed(
            [parent1, parent2, shared],
            direct_installs=[parent1, parent2],
            dependents=[
                ("skill:shared", parent1),
                ("skill:shared", parent2),
            ],
        )
        mock_get_root.return_value = root
        mock_lockfile_path.return_value = root / "strawpot.lock"

        _uninstall_impl("parent1", kind="skill", ver=None, is_global=False)

        # parent1 removed, but shared dep still needed by parent2
        assert not get_package_dir(root, "skill", "parent1").exists()
        assert get_package_dir(root, "skill", "shared").exists()

    def test_root_and_global_conflict(self):
        """--root and --global cannot be used together."""
        with patch("strawhub.paths._local_root_override", "/tmp/x"):
            with pytest.raises(SystemExit):
                _uninstall_impl("x", kind="skill", ver=None, is_global=True)

    def test_save_and_global_conflict(self):
        """--save and --global cannot be used together."""
        with pytest.raises(SystemExit):
            _uninstall_impl("x", kind="skill", ver=None, is_global=True, save=True)
