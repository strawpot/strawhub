"""Project file (strawpot.toml) read/write operations.

The project file declares dependencies with optional version constraints:

    [skills]
    git-workflow = "^1.0.0"
    code-review = "==2.1.0"
    security-baseline = "*"

    [roles]
    implementer = "^1.0.0"
    reviewer = ">=2.0.0"

Constraint formats:
    "*"       — latest version
    "^X.Y.Z"  — compatible (same major, >= specified)
    "==X.Y.Z" — exact version
    ">=X.Y.Z" — minimum version
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

    def __init__(self, path: Path):
        self.path = path
        self.skills: dict[str, str] = {}
        self.roles: dict[str, str] = {}

    @classmethod
    def load(cls, path: Path) -> ProjectFile:
        """Load from disk. Returns empty ProjectFile if file doesn't exist."""
        pf = cls(path)
        if not path.exists():
            return pf
        with open(path, "rb") as f:
            data = tomllib.load(f)
        pf.skills = {k: str(v) for k, v in data.get("skills", {}).items()}
        pf.roles = {k: str(v) for k, v in data.get("roles", {}).items()}
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
        if self.skills:
            lines.append("[skills]")
            for slug in sorted(self.skills):
                lines.append(f'{slug} = "{self.skills[slug]}"')
            lines.append("")
        if self.roles:
            lines.append("[roles]")
            for slug in sorted(self.roles):
                lines.append(f'{slug} = "{self.roles[slug]}"')
            lines.append("")
        self.path.write_text("\n".join(lines))

    def add_dependency(
        self, kind: str, slug: str, version: str, exact: bool = False
    ) -> None:
        """Add or update a dependency with a version constraint."""
        constraint = f"=={version}" if exact else f"^{version}"
        target = self.skills if kind == "skill" else self.roles
        target[slug] = constraint

    def update_dependency(self, kind: str, slug: str, new_version: str) -> bool:
        """Update the version in an existing constraint, preserving the operator.

        "^1.0.0" + "1.3.0" → "^1.3.0"
        "==1.0.0" + "2.0.0" → "==2.0.0"
        ">=1.0.0" + "1.5.0" → ">=1.5.0"
        "*" stays "*"

        Returns True if the dependency existed and was updated.
        """
        target = self.skills if kind == "skill" else self.roles
        if slug not in target:
            return False
        current = target[slug]
        if current == "*":
            return True  # no version to update
        # Extract operator prefix (==, >=, ^)
        for op in ("==", ">=", "^"):
            if current.startswith(op):
                target[slug] = f"{op}{new_version}"
                return True
        # Unknown format, overwrite with caret
        target[slug] = f"^{new_version}"
        return True

    def get_constraint(self, kind: str, slug: str) -> str | None:
        """Get the constraint string for a dependency, or None."""
        target = self.skills if kind == "skill" else self.roles
        return target.get(slug)

    def remove_dependency(self, kind: str, slug: str) -> bool:
        """Remove a dependency. Returns True if it was present."""
        target = self.skills if kind == "skill" else self.roles
        if slug in target:
            del target[slug]
            return True
        return False

    def get_all_dependencies(self) -> list[tuple[str, str, str]]:
        """Return all dependencies as (kind, slug, constraint) tuples."""
        deps: list[tuple[str, str, str]] = []
        for slug, constraint in self.skills.items():
            deps.append(("skill", slug, constraint))
        for slug, constraint in self.roles.items():
            deps.append(("role", slug, constraint))
        return deps

    def has_dependency(self, kind: str, slug: str) -> bool:
        """Check if a dependency is declared."""
        target = self.skills if kind == "skill" else self.roles
        return slug in target

    @property
    def is_empty(self) -> bool:
        return not self.skills and not self.roles
