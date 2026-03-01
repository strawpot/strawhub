"""Lockfile (strawpot.lock) read/write/query operations.

The lockfile tracks all installed packages with per-version reference counting.
Format:
{
  "version": 1,
  "directInstalls": [{"kind": "role", "slug": "implementer", "version": "1.0.0"}],
  "packages": {
    "role:implementer:1.0.0": {
      "kind": "role", "slug": "implementer", "version": "1.0.0",
      "dependents": []
    },
    "skill:git-workflow:1.0.0": {
      "kind": "skill", "slug": "git-workflow", "version": "1.0.0",
      "dependents": ["role:implementer:1.0.0"]
    }
  }
}
"""

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PackageRef:
    kind: str  # "skill" or "role"
    slug: str
    version: str

    @property
    def key(self) -> str:
        """Unique key for lockfile, e.g. 'skill:git-workflow:1.0.0'."""
        return f"{self.kind}:{self.slug}:{self.version}"

    @property
    def dir_name(self) -> str:
        """Directory name, e.g. 'git-workflow-1.0.0'."""
        return f"{self.slug}-{self.version}"


class Lockfile:
    """Manages the strawpot.lock file."""

    def __init__(self, path: Path):
        self.path = path
        self.direct_installs: list[PackageRef] = []
        self.packages: dict[str, dict] = {}

    @classmethod
    def load(cls, path: Path) -> "Lockfile":
        """Load a lockfile from disk. Returns empty lockfile if file doesn't exist."""
        lf = cls(path)
        if not path.exists():
            return lf

        data = json.loads(path.read_text(encoding="utf-8"))
        for d in data.get("directInstalls", []):
            lf.direct_installs.append(
                PackageRef(kind=d["kind"], slug=d["slug"], version=d["version"])
            )
        lf.packages = data.get("packages", {})
        return lf

    def save(self) -> None:
        """Write lockfile to disk."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "version": 1,
            "directInstalls": [
                {"kind": r.kind, "slug": r.slug, "version": r.version}
                for r in self.direct_installs
            ],
            "packages": self.packages,
        }
        self.path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    def add_direct_install(self, ref: PackageRef) -> None:
        """Register a package as a direct (user-requested) install."""
        if not any(r.key == ref.key for r in self.direct_installs):
            self.direct_installs.append(ref)

    def remove_direct_install(self, ref: PackageRef) -> None:
        """Remove a package from direct installs."""
        self.direct_installs = [r for r in self.direct_installs if r.key != ref.key]

    def add_package(self, ref: PackageRef, dependent: PackageRef | None = None) -> None:
        """Register a package in the lockfile.

        If dependent is given, add it to the package's dependents list.
        If the package already exists, just add the dependent.
        """
        if ref.key not in self.packages:
            self.packages[ref.key] = {
                "kind": ref.kind,
                "slug": ref.slug,
                "version": ref.version,
                "dependents": [],
            }
        if dependent and dependent.key not in self.packages[ref.key]["dependents"]:
            self.packages[ref.key]["dependents"].append(dependent.key)

    def remove_dependent(self, package_key: str, dependent_key: str) -> None:
        """Remove a dependent from a package's dependents list."""
        if package_key in self.packages:
            deps = self.packages[package_key]["dependents"]
            self.packages[package_key]["dependents"] = [
                d for d in deps if d != dependent_key
            ]

    def has_package(self, ref: PackageRef) -> bool:
        """Check if a specific version is registered."""
        return ref.key in self.packages

    def is_direct_install(self, key: str) -> bool:
        """Check if a package key is a direct install."""
        return any(r.key == key for r in self.direct_installs)

    def is_orphan(self, package_key: str) -> bool:
        """Check if a package has no dependents and is not a direct install."""
        if package_key not in self.packages:
            return False
        pkg = self.packages[package_key]
        return not pkg["dependents"] and not self.is_direct_install(package_key)

    def collect_orphans(self) -> list[str]:
        """Return all orphaned package keys, cascading.

        An orphan is a package with no dependents that is not a direct install.
        Removing an orphan may create new orphans, so this cascades.
        """
        # Work on a copy to simulate removal
        remaining = dict(self.packages)
        all_orphans: list[str] = []

        changed = True
        while changed:
            changed = False
            for key in list(remaining.keys()):
                pkg = remaining[key]
                has_dependents = any(d in remaining for d in pkg["dependents"])
                if not has_dependents and not self.is_direct_install(key):
                    all_orphans.append(key)
                    del remaining[key]
                    changed = True

        return all_orphans

    def get_packages_for_slug(self, kind: str, slug: str) -> list[PackageRef]:
        """Return all installed versions of a given slug."""
        results = []
        for key, pkg in self.packages.items():
            if pkg["kind"] == kind and pkg["slug"] == slug:
                results.append(
                    PackageRef(kind=pkg["kind"], slug=pkg["slug"], version=pkg["version"])
                )
        return results

    def remove_package(self, package_key: str) -> None:
        """Remove a package entry from the lockfile.

        Also removes this key from all other packages' dependents lists.
        """
        self.packages.pop(package_key, None)
        for pkg in self.packages.values():
            pkg["dependents"] = [d for d in pkg["dependents"] if d != package_key]
