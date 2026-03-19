"""Project file (strawpot.toml) read/write operations.

The project file declares dependencies with optional version constraints:

    [skills]
    git-workflow = "*"
    code-review = "==2.1.0"
    security-baseline = "*"

    [roles]
    implementer = "*"
    reviewer = "==2.0.0"

    [agents]
    my-agent = "*"

    [memories]
    shared-context = "==1.0.0"

    [integrations]
    discord = "*"

Constraint formats:
    "*"       — latest version
    "==X.Y.Z" — exact version
"""

from __future__ import annotations

import sys
from pathlib import Path

if sys.version_info >= (3, 11):
    import tomllib
else:
    import tomli as tomllib


class ProjectFile:
    """Manages the strawpot.toml project file."""

    _SECTIONS = ("skills", "roles", "agents", "memories", "integrations")

    def __init__(self, path: Path):
        self.path = path
        self.skills: dict[str, str] = {}
        self.roles: dict[str, str] = {}
        self.agents: dict[str, str] = {}
        self.memories: dict[str, str] = {}
        self.integrations: dict[str, str] = {}

    @classmethod
    def load(cls, path: Path) -> ProjectFile:
        """Load from disk. Returns empty ProjectFile if file doesn't exist."""
        pf = cls(path)
        if not path.exists():
            return pf
        with open(path, "rb") as f:
            data = tomllib.load(f)
        for section in cls._SECTIONS:
            setattr(pf, section, {k: str(v) for k, v in data.get(section, {}).items()})
        return pf

    @classmethod
    def load_if_exists(cls, path: Path) -> ProjectFile | None:
        """Load from disk, returning None if file doesn't exist."""
        if not path.exists():
            return None
        return cls.load(path)

    def save(self) -> None:
        """Write project file to disk."""
        lines: list[str] = []
        for section in self._SECTIONS:
            entries: dict[str, str] = getattr(self, section)
            if entries:
                lines.append(f"[{section}]")
                for slug in sorted(entries):
                    lines.append(f'{slug} = "{entries[slug]}"')
                lines.append("")
        self.path.write_text("\n".join(lines), encoding="utf-8")

    # Map kind → attribute name (handles irregular plural "memory" → "memories")
    _KIND_TO_SECTION = {
        "skill": "skills",
        "role": "roles",
        "agent": "agents",
        "memory": "memories",
        "integration": "integrations",
    }

    def _target(self, kind: str) -> dict[str, str]:
        """Return the dict for the given package kind."""
        section = self._KIND_TO_SECTION[kind]
        return getattr(self, section)

    def add_dependency(
        self, kind: str, slug: str, version: str, exact: bool = False
    ) -> None:
        """Add or update a dependency with a version constraint."""
        constraint = f"=={version}" if exact else "*"
        self._target(kind)[slug] = constraint

    def update_dependency(self, kind: str, slug: str, new_version: str) -> bool:
        """Update the version in an existing constraint, preserving the operator.

        "==1.0.0" + "2.0.0" → "==2.0.0"
        "*" stays "*"

        Returns True if the dependency existed and was updated.
        """
        target = self._target(kind)
        if slug not in target:
            return False
        current = target[slug]
        if current == "*":
            return True  # no version to update
        if current.startswith("=="):
            target[slug] = f"=={new_version}"
            return True
        # Unknown format, keep as-is
        return True

    def get_constraint(self, kind: str, slug: str) -> str | None:
        """Get the constraint string for a dependency, or None."""
        target = self._target(kind)
        return target.get(slug)

    def remove_dependency(self, kind: str, slug: str) -> bool:
        """Remove a dependency. Returns True if it was present."""
        target = self._target(kind)
        if slug in target:
            del target[slug]
            return True
        return False

    # Reverse map: section name → kind
    _SECTION_TO_KIND = {v: k for k, v in _KIND_TO_SECTION.items()}

    def get_all_dependencies(self) -> list[tuple[str, str, str]]:
        """Return all dependencies as (kind, slug, constraint) tuples."""
        deps: list[tuple[str, str, str]] = []
        for section in self._SECTIONS:
            kind = self._SECTION_TO_KIND[section]
            for slug, constraint in getattr(self, section).items():
                deps.append((kind, slug, constraint))
        return deps

    def has_dependency(self, kind: str, slug: str) -> bool:
        """Check if a dependency is declared."""
        target = self._target(kind)
        return slug in target

    @property
    def is_empty(self) -> bool:
        return all(not getattr(self, s) for s in self._SECTIONS)
