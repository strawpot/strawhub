"""Path resolution for .strawpot directories.

Global root: STRAWPOT_HOME env var → ~/.strawpot (default)
Local root:  ./.strawpot in the current working directory
"""

import os
from pathlib import Path


_KIND_SUBDIRS = {
    "skill": "skills",
    "role": "roles",
    "agent": "agents",
    "memory": "memories",
}


def get_project_file_path() -> Path:
    """Return the path to strawpot.toml in the current working directory."""
    return Path.cwd() / "strawpot.toml"


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


def get_package_dir(root: Path, kind: str, slug: str) -> Path:
    """Return the package directory path, e.g. root/skills/git-workflow/"""
    return root / _KIND_SUBDIRS[kind] / slug


def package_exists(root: Path, kind: str, slug: str) -> bool:
    """Check if a package directory exists."""
    return get_package_dir(root, kind, slug).is_dir()


def get_installed_version(root: Path, kind: str, slug: str) -> str | None:
    """Read the installed version from the .version file in a package dir."""
    version_file = get_package_dir(root, kind, slug) / ".version"
    if version_file.is_file():
        return version_file.read_text(encoding="utf-8").strip()
    return None


def find_installed_versions(root: Path, kind: str, slug: str) -> list[str]:
    """Return the installed version of a slug as a list (empty or single-element)."""
    version = get_installed_version(root, kind, slug)
    return [version] if version else []
