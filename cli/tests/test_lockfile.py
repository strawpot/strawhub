"""Tests for lockfile.py — lockfile CRUD with reference counting."""

import json

import pytest

from strawhub.lockfile import Lockfile, PackageRef


class TestPackageRef:
    def test_key(self):
        ref = PackageRef("skill", "git-workflow", "1.0.0")
        assert ref.key == "skill:git-workflow:1.0.0"

    def test_dir_name(self):
        ref = PackageRef("role", "implementer", "2.1.0")
        assert ref.dir_name == "implementer-2.1.0"

    def test_frozen(self):
        ref = PackageRef("skill", "git-workflow", "1.0.0")
        with pytest.raises(AttributeError):
            ref.slug = "other"  # type: ignore[misc]


class TestLockfileLoadSave:
    def test_load_nonexistent(self, tmp_path):
        lf = Lockfile.load(tmp_path / "strawpot.lock")
        assert lf.direct_installs == []
        assert lf.packages == {}

    def test_save_and_reload(self, tmp_path):
        path = tmp_path / "strawpot.lock"
        lf = Lockfile(path)

        ref = PackageRef("skill", "git-workflow", "1.0.0")
        lf.add_package(ref)
        lf.add_direct_install(ref)
        lf.save()

        lf2 = Lockfile.load(path)
        assert len(lf2.direct_installs) == 1
        assert lf2.direct_installs[0].key == ref.key
        assert lf2.has_package(ref)

    def test_save_creates_parent_dirs(self, tmp_path):
        path = tmp_path / "nested" / "dir" / "strawpot.lock"
        lf = Lockfile(path)
        lf.save()
        assert path.exists()

    def test_lockfile_format(self, tmp_path):
        path = tmp_path / "strawpot.lock"
        lf = Lockfile(path)
        lf.add_package(PackageRef("skill", "x", "1.0.0"))
        lf.save()

        data = json.loads(path.read_text())
        assert data["version"] == 1
        assert "directInstalls" in data
        assert "packages" in data


class TestLockfileDirectInstalls:
    def test_add_direct_install(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        ref = PackageRef("skill", "git-workflow", "1.0.0")
        lf.add_direct_install(ref)
        assert len(lf.direct_installs) == 1

    def test_no_duplicate_direct_install(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        ref = PackageRef("skill", "git-workflow", "1.0.0")
        lf.add_direct_install(ref)
        lf.add_direct_install(ref)
        assert len(lf.direct_installs) == 1

    def test_remove_direct_install(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        ref = PackageRef("skill", "git-workflow", "1.0.0")
        lf.add_direct_install(ref)
        lf.remove_direct_install(ref)
        assert lf.direct_installs == []


class TestLockfilePackages:
    def test_add_package_no_dependent(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        ref = PackageRef("role", "implementer", "1.0.0")
        lf.add_package(ref)
        assert lf.has_package(ref)
        assert lf.packages[ref.key]["dependents"] == []

    def test_add_package_with_dependent(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        parent = PackageRef("role", "implementer", "1.0.0")
        child = PackageRef("skill", "git-workflow", "1.0.0")
        lf.add_package(child, dependent=parent)
        assert parent.key in lf.packages[child.key]["dependents"]

    def test_add_dependent_to_existing(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        child = PackageRef("skill", "git-workflow", "1.0.0")
        p1 = PackageRef("role", "implementer", "1.0.0")
        p2 = PackageRef("role", "reviewer", "1.0.0")

        lf.add_package(child, dependent=p1)
        lf.add_package(child, dependent=p2)
        assert len(lf.packages[child.key]["dependents"]) == 2

    def test_no_duplicate_dependent(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        child = PackageRef("skill", "git-workflow", "1.0.0")
        parent = PackageRef("role", "implementer", "1.0.0")

        lf.add_package(child, dependent=parent)
        lf.add_package(child, dependent=parent)
        assert len(lf.packages[child.key]["dependents"]) == 1

    def test_remove_dependent(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        child = PackageRef("skill", "git-workflow", "1.0.0")
        parent = PackageRef("role", "implementer", "1.0.0")

        lf.add_package(child, dependent=parent)
        lf.remove_dependent(child.key, parent.key)
        assert lf.packages[child.key]["dependents"] == []

    def test_remove_package(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        ref = PackageRef("skill", "git-workflow", "1.0.0")
        other = PackageRef("role", "implementer", "1.0.0")

        lf.add_package(ref)
        lf.add_package(other, dependent=ref)
        lf.remove_package(ref.key)

        assert ref.key not in lf.packages
        # Also removes from other packages' dependents
        assert ref.key not in lf.packages[other.key]["dependents"]

    def test_get_packages_for_slug(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        lf.add_package(PackageRef("skill", "git-workflow", "1.0.0"))
        lf.add_package(PackageRef("skill", "git-workflow", "1.4.0"))
        lf.add_package(PackageRef("skill", "other", "1.0.0"))

        results = lf.get_packages_for_slug("skill", "git-workflow")
        assert len(results) == 2
        versions = {r.version for r in results}
        assert versions == {"1.0.0", "1.4.0"}


class TestLockfileOrphans:
    def test_direct_install_is_not_orphan(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        ref = PackageRef("skill", "git-workflow", "1.0.0")
        lf.add_package(ref)
        lf.add_direct_install(ref)
        assert lf.is_orphan(ref.key) is False

    def test_package_with_dependents_is_not_orphan(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        child = PackageRef("skill", "git-workflow", "1.0.0")
        parent = PackageRef("role", "implementer", "1.0.0")
        lf.add_package(parent)
        lf.add_package(child, dependent=parent)
        assert lf.is_orphan(child.key) is False

    def test_package_without_dependents_is_orphan(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        ref = PackageRef("skill", "git-workflow", "1.0.0")
        lf.add_package(ref)
        assert lf.is_orphan(ref.key) is True

    def test_collect_orphans_simple(self, tmp_path):
        lf = Lockfile(tmp_path / "strawpot.lock")
        impl = PackageRef("role", "implementer", "1.0.0")
        gw = PackageRef("skill", "git-workflow", "1.0.0")
        cr = PackageRef("skill", "code-review", "1.0.0")

        lf.add_package(impl)
        lf.add_direct_install(impl)
        lf.add_package(gw, dependent=impl)
        lf.add_package(cr, dependent=impl)

        # No orphans while impl is a direct install
        assert lf.collect_orphans() == []

        # Remove impl from direct installs → all become orphans
        lf.remove_direct_install(impl)
        orphans = set(lf.collect_orphans())
        assert orphans == {impl.key, gw.key, cr.key}

    def test_collect_orphans_cascading(self, tmp_path):
        """Removing A orphans B, which then orphans C."""
        lf = Lockfile(tmp_path / "strawpot.lock")
        a = PackageRef("role", "a", "1.0.0")
        b = PackageRef("role", "b", "1.0.0")
        c = PackageRef("skill", "c", "1.0.0")

        lf.add_package(a)
        lf.add_direct_install(a)
        lf.add_package(b, dependent=a)
        lf.add_package(c, dependent=b)

        lf.remove_direct_install(a)
        orphans = set(lf.collect_orphans())
        assert orphans == {a.key, b.key, c.key}

    def test_shared_dependency_not_orphaned(self, tmp_path):
        """If two direct installs share a dep, removing one doesn't orphan the dep."""
        lf = Lockfile(tmp_path / "strawpot.lock")
        a = PackageRef("role", "a", "1.0.0")
        b = PackageRef("role", "b", "1.0.0")
        shared = PackageRef("skill", "shared", "1.0.0")

        lf.add_package(a)
        lf.add_direct_install(a)
        lf.add_package(b)
        lf.add_direct_install(b)
        lf.add_package(shared, dependent=a)
        lf.add_package(shared, dependent=b)

        lf.remove_direct_install(a)
        orphans = set(lf.collect_orphans())
        # Only 'a' is orphaned. 'shared' still has 'b' as dependent, and 'b' is direct.
        assert orphans == {a.key}
