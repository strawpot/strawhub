"""Runtime dependency resolution — selects paths to the latest compatible installed versions.

Scans local .strawpot/ first, then global, to build an index of installed packages.
For a given root package, reads its SKILL.md/ROLE.md frontmatter to get dependency
constraints, then selects the highest installed version satisfying each constraint.

Importable as: from strawhub.resolver import resolve
"""

from dataclasses import dataclass
from pathlib import Path

from strawhub.errors import DependencyError
from strawhub.frontmatter import parse_frontmatter
from strawhub.paths import (
    get_global_root,
    get_local_root,
    get_package_dir,
)
from strawhub.version_spec import (
    DependencySpec,
    parse_dependency_spec,
    parse_dir_name,
    parse_version,
    satisfies_version,
)


@dataclass
class ResolvedPackage:
    kind: str
    slug: str
    version: str
    path: str
    source: str  # "local" or "global"


def resolve(
    slug: str,
    kind: str | None = None,
    version: str | None = None,
    local_root: Path | None = None,
    global_root: Path | None = None,
) -> dict:
    """Resolve a slug to its installed path and all transitive dependency paths.

    Scans local .strawpot/ first, then global.

    Returns a JSON-serializable dict:
    {
        "slug": "implementer",
        "kind": "role",
        "version": "1.0.0",
        "path": "/path/to/.strawpot/roles/implementer-1.0.0",
        "source": "local",
        "dependencies": [
            {"slug": "git-workflow", "kind": "skill", "version": "1.2.0",
             "path": "/path/to/.strawpot/skills/git-workflow-1.2.0",
             "source": "local"},
            ...
        ]
    }
    """
    lr = local_root or get_local_root()
    gr = global_root or get_global_root()

    # Step 1: Build index of all installed packages
    index = _build_index(lr, gr)

    # Step 2: Determine kind
    if kind is None:
        if ("skill", slug) in index:
            kind = "skill"
        elif ("role", slug) in index:
            kind = "role"
        else:
            raise DependencyError(
                f"'{slug}' is not installed as a skill or role."
            )

    # Step 3: Validate the root package exists
    candidates = index.get((kind, slug), [])
    if not candidates:
        raise DependencyError(
            f"{kind} '{slug}' is not installed."
        )

    if version:
        matches = [c for c in candidates if c[0] == version]
        if not matches:
            installed = ", ".join(c[0] for c in candidates)
            raise DependencyError(
                f"{kind} '{slug}' v{version} is not installed. "
                f"Installed versions: {installed}"
            )

    # Step 4: Resolve transitive dependencies via DFS
    resolved: dict[tuple[str, str], ResolvedPackage] = {}
    visiting: set[tuple[str, str]] = set()

    def resolve_pkg(
        pkg_kind: str, pkg_slug: str, constraint: DependencySpec | None = None
    ) -> None:
        key = (pkg_kind, pkg_slug)
        if key in resolved:
            return
        if key in visiting:
            raise DependencyError(
                f"Circular dependency detected: {pkg_kind} '{pkg_slug}'"
            )
        visiting.add(key)

        pkg_candidates = index.get(key, [])
        if constraint:
            pkg_candidates = [
                (v, p, s)
                for v, p, s in pkg_candidates
                if satisfies_version(v, constraint)
            ]
        if not pkg_candidates:
            constraint_str = ""
            if constraint and constraint.version:
                constraint_str = f" {constraint.operator}{constraint.version}"
            raise DependencyError(
                f"No installed version of {pkg_kind} '{pkg_slug}' "
                f"satisfies '{pkg_slug}{constraint_str}'.\n"
                f"Run: strawhub install {pkg_slug} --kind {pkg_kind}"
            )

        # Pick highest matching version
        pkg_candidates.sort(key=lambda c: parse_version(c[0]), reverse=True)
        best_version, best_path, best_source = pkg_candidates[0]

        # Read frontmatter to get dependency constraints
        main_file = "SKILL.md" if pkg_kind == "skill" else "ROLE.md"
        main_path = Path(best_path) / main_file
        deps_specs = _read_dependency_specs(main_path, pkg_kind)

        # Recurse into dependencies
        for dep_kind, dep_spec in deps_specs:
            resolve_pkg(dep_kind, dep_spec.slug, dep_spec)

        visiting.discard(key)
        resolved[key] = ResolvedPackage(
            kind=pkg_kind,
            slug=pkg_slug,
            version=best_version,
            path=best_path,
            source=best_source,
        )

    # Resolve the root package and all its deps
    root_constraint = None
    if version:
        root_constraint = DependencySpec(slug=slug, operator="==", version=version)
    resolve_pkg(kind, slug, root_constraint)

    # Step 5: Format output
    root_pkg = resolved.pop((kind, slug))
    return {
        "slug": root_pkg.slug,
        "kind": root_pkg.kind,
        "version": root_pkg.version,
        "path": root_pkg.path,
        "source": root_pkg.source,
        "dependencies": [
            {
                "slug": r.slug,
                "kind": r.kind,
                "version": r.version,
                "path": r.path,
                "source": r.source,
            }
            for r in resolved.values()
        ],
    }


def _build_index(
    local_root: Path, global_root: Path
) -> dict[tuple[str, str], list[tuple[str, str, str]]]:
    """Build an index of all installed packages across both scopes.

    Returns: {(kind, slug): [(version, abs_path, scope), ...]}
    Local entries are added first so they take priority when both have the same version.
    """
    index: dict[tuple[str, str], list[tuple[str, str, str]]] = {}

    for scope, root in [("local", local_root), ("global", global_root)]:
        for kind in ["skill", "role"]:
            subdir = root / ("skills" if kind == "skill" else "roles")
            if not subdir.is_dir():
                continue
            for entry in subdir.iterdir():
                if not entry.is_dir():
                    continue
                parsed = parse_dir_name(entry.name)
                if not parsed:
                    continue
                pkg_slug, pkg_version = parsed
                key = (kind, pkg_slug)
                if key not in index:
                    index[key] = []
                # Skip if same version already indexed (local takes priority)
                existing_versions = {v for v, _, _ in index[key]}
                if pkg_version not in existing_versions:
                    index[key].append((pkg_version, str(entry.resolve()), scope))

    return index


def _read_dependency_specs(
    main_file_path: Path, kind: str
) -> list[tuple[str, DependencySpec]]:
    """Read and parse dependency specs from a SKILL.md or ROLE.md file.

    Returns list of (dep_kind, DependencySpec) tuples.
    """
    if not main_file_path.exists():
        return []

    text = main_file_path.read_text()
    parsed = parse_frontmatter(text)
    fm = parsed.get("frontmatter", {})
    deps = fm.get("dependencies")
    if not deps:
        return []

    result: list[tuple[str, DependencySpec]] = []

    if kind == "skill":
        # Skills: flat list of skill specs
        if isinstance(deps, list):
            for spec_str in deps:
                result.append(("skill", parse_dependency_spec(spec_str)))
    else:
        # Roles: structured {skills: [...], roles: [...]}
        if isinstance(deps, dict):
            for spec_str in deps.get("skills", []):
                result.append(("skill", parse_dependency_spec(spec_str)))
            for spec_str in deps.get("roles", []):
                result.append(("role", parse_dependency_spec(spec_str)))

    return result
