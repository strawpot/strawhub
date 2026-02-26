"""Path resolution for .strawpot directories.

Global root: STRAWPOT_HOME env var → ~/.strawpot (default)
Local root:  ./.strawpot in the current working directory
"""

import os
from pathlib import Path

from strawhub.version_spec import parse_dir_name


def get_global_root() -> Path:
    """Return the global .strawpot root directory.

    Uses STRAWPOT_HOME env var if set, otherwise ~/.strawpot.
    """
    env = os.environ.get("STRAWPOT_HOME")
    if env:
        return Path(env)
    return Path.home() / ".strawpot"


def get_local_root() -> Path:
    """Return the local .strawpot root in the current working directory."""
    return Path.cwd() / ".strawpot"


def get_root(is_global: bool) -> Path:
    """Return the appropriate .strawpot root based on scope."""
    return get_global_root() if is_global else get_local_root()


def get_skills_dir(root: Path) -> Path:
    return root / "skills"


def get_roles_dir(root: Path) -> Path:
    return root / "roles"


def get_lockfile_path(root: Path) -> Path:
    return root / "strawpot.lock"


def get_package_dir(root: Path, kind: str, slug: str, version: str) -> Path:
    """Return the package directory path, e.g. root/skills/git-workflow-1.0.0/"""
    subdir = "skills" if kind == "skill" else "roles"
    return root / subdir / f"{slug}-{version}"


def package_exists(root: Path, kind: str, slug: str, version: str) -> bool:
    """Check if a package directory exists."""
    return get_package_dir(root, kind, slug, version).is_dir()


def find_installed_versions(root: Path, kind: str, slug: str) -> list[str]:
    """Scan .strawpot/{kind}s/ for directories matching {slug}-X.Y.Z.

    Returns a list of version strings found on disk.
    """
    subdir = "skills" if kind == "skill" else "roles"
    parent = root / subdir
    if not parent.is_dir():
        return []

    versions = []
    for entry in parent.iterdir():
        if not entry.is_dir():
            continue
        parsed = parse_dir_name(entry.name)
        if parsed and parsed[0] == slug:
            versions.append(parsed[1])
    return versions
