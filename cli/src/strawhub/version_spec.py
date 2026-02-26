"""Parse and validate semver version specifiers for dependencies.

Supported formats:
  "slug"              — resolves to latest
  "slug==1.0.0"       — exact version
  "slug>=1.0.0"       — minimum version
  "slug^1.0.0"        — compatible (same major, >= specified)

Python port of convex/lib/versionSpec.ts.
"""

import re
from dataclasses import dataclass
from typing import Literal

SPEC_REGEX = re.compile(r"^([a-z0-9][a-z0-9-]*)(==|>=|\^)(\d+\.\d+\.\d+)$")
SLUG_REGEX = re.compile(r"^[a-z0-9][a-z0-9-]*$")
VERSION_REGEX = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
DIR_NAME_REGEX = re.compile(r"^(.+)-(\d+\.\d+\.\d+)$")


@dataclass(frozen=True)
class DependencySpec:
    slug: str
    operator: Literal["latest", "==", ">=", "^"]
    version: str | None


@dataclass(frozen=True, order=True)
class ParsedVersion:
    major: int
    minor: int
    patch: int


def parse_dependency_spec(spec: str) -> DependencySpec:
    """Parse a dependency string into its components.

    "git-workflow"        → DependencySpec("git-workflow", "latest", None)
    "git-workflow>=1.0.0" → DependencySpec("git-workflow", ">=", "1.0.0")
    """
    s = spec.strip()

    m = SPEC_REGEX.match(s)
    if m:
        return DependencySpec(slug=m.group(1), operator=m.group(2), version=m.group(3))  # type: ignore[arg-type]

    if SLUG_REGEX.match(s):
        return DependencySpec(slug=s, operator="latest", version=None)

    raise ValueError(f"Invalid dependency specifier: '{spec}'")


def parse_version(version: str) -> ParsedVersion:
    """Parse a version string "major.minor.patch" into components."""
    m = VERSION_REGEX.match(version)
    if not m:
        raise ValueError(f"Invalid version: '{version}'")
    return ParsedVersion(
        major=int(m.group(1)),
        minor=int(m.group(2)),
        patch=int(m.group(3)),
    )


def compare_versions(a: ParsedVersion, b: ParsedVersion) -> int:
    """Compare two parsed versions. Returns -1 if a < b, 0 if equal, 1 if a > b."""
    if a.major != b.major:
        return -1 if a.major < b.major else 1
    if a.minor != b.minor:
        return -1 if a.minor < b.minor else 1
    if a.patch != b.patch:
        return -1 if a.patch < b.patch else 1
    return 0


def satisfies_version(candidate_version: str, spec: DependencySpec) -> bool:
    """Check if a candidate version satisfies a dependency spec.

    latest  → always true
    ==X.Y.Z → candidate == X.Y.Z
    >=X.Y.Z → candidate >= X.Y.Z
    ^X.Y.Z  → candidate.major == X.major AND candidate >= X.Y.Z
    """
    if spec.operator == "latest" or spec.version is None:
        return True

    candidate = parse_version(candidate_version)
    required = parse_version(spec.version)

    if spec.operator == "==":
        return compare_versions(candidate, required) == 0
    elif spec.operator == ">=":
        return compare_versions(candidate, required) >= 0
    elif spec.operator == "^":
        return (
            candidate.major == required.major
            and compare_versions(candidate, required) >= 0
        )
    return False


def extract_slug(spec: str) -> str:
    """Extract just the slug from a dependency spec string."""
    return parse_dependency_spec(spec).slug


def parse_dir_name(name: str) -> tuple[str, str] | None:
    """Parse a directory name like 'git-workflow-1.0.0' into ('git-workflow', '1.0.0').

    Returns None if the name doesn't match the expected pattern.
    The regex is greedy on the slug part, so 'my-cool-skill-1.0.0' correctly
    yields ('my-cool-skill', '1.0.0').
    """
    m = DIR_NAME_REGEX.match(name)
    if m:
        return (m.group(1), m.group(2))
    return None
