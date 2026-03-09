"""Path resolution for .strawpot directories.

Global root: STRAWPOT_HOME env var → ~/.strawpot (default)
Local root:  ./.strawpot in the current working directory (or --root override)
"""

import os
from pathlib import Path


_KIND_SUBDIRS = {
    "skill": "skills",
    "role": "roles",
    "agent": "agents",
    "memory": "memories",
}

# Module-level override set by ``--root`` CLI option.
_local_root_override: Path | None = None


def set_local_root(path: Path | None) -> None:
    """Override the local root directory.

    Called by the CLI ``--root`` option.  Pass ``None`` to reset.
    """
    global _local_root_override
    _local_root_override = path


def get_project_file_path() -> Path:
    """Return the path to strawpot.toml in the project directory."""
    if _local_root_override is not None:
        return _local_root_override.parent / "strawpot.toml"
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
    """Return the local .strawpot root.

    Uses the ``--root`` override if set, otherwise falls back to
    ``./.strawpot`` in the current working directory.
    """
    if _local_root_override is not None:
        return _local_root_override
    return Path.cwd() / ".strawpot"


def get_root(is_global: bool) -> Path:
    """Return the appropriate .strawpot root based on scope."""
    return get_global_root() if is_global else get_local_root()


def get_skills_dir(root: Path) -> Path:
    return root / "skills"


def get_roles_dir(root: Path) -> Path:
    return root / "roles"


def get_agents_dir(root: Path) -> Path:
    return root / "agents"


def get_memories_dir(root: Path) -> Path:
    return root / "memories"


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
