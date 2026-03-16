"""Validate a package directory before publishing.

Checks frontmatter schema, file constraints, slug format, and
content-type-specific rules — all offline, no auth required.
"""

import re
from pathlib import Path

import click

from strawhub.display import print_success, print_error, console
from strawhub.frontmatter import parse_frontmatter, extract_dependencies

# Keep in sync with convex/lib/publishValidation.ts
SLUG_REGEX = re.compile(r"^[a-z0-9][a-z0-9-]*$")
MAX_SLUG_LENGTH = 64
MAX_DISPLAY_NAME_LENGTH = 128
MAX_FILE_COUNT = 100
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB per file
MAX_TOTAL_SIZE = 50 * 1024 * 1024  # 50 MB total
MAX_DEPENDENCIES = 50

# Allowed text extensions for skills (no binaries)
SKILL_TEXT_EXTENSIONS = {
    ".md", ".mdx", ".txt",
    ".json", ".json5", ".yaml", ".yml", ".toml", ".xml", ".ini", ".cfg",
    ".env", ".csv", ".conf",
}

MAIN_FILES = {
    "skill": "SKILL.md",
    "role": "ROLE.md",
    "agent": "AGENT.md",
    "memory": "MEMORY.md",
    "integration": "INTEGRATION.md",
}


def _collect_files(directory: Path) -> list[tuple[str, int]]:
    """Collect (relative_path, size) for all non-hidden files."""
    files = []
    for file_path in sorted(directory.rglob("*")):
        if file_path.is_file() and not any(
            part.startswith(".") for part in file_path.relative_to(directory).parts
        ):
            relative = file_path.relative_to(directory).as_posix()
            files.append((relative, file_path.stat().st_size))
    return files


def _validate_package(directory: Path, kind: str) -> list[str]:
    """Validate a package directory. Returns a list of error messages."""
    errors: list[str] = []
    main_file = MAIN_FILES[kind]
    main_path = directory / main_file

    # --- Main file exists ---
    if not main_path.exists():
        errors.append(f"Missing required file: {main_file}")
        return errors  # Can't continue without main file

    # --- Parse frontmatter ---
    try:
        content = main_path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        errors.append(f"{main_file} is not valid UTF-8 text")
        return errors

    parsed = parse_frontmatter(content)
    fm = parsed.get("frontmatter", {})

    # --- name field ---
    slug = fm.get("name") or fm.get("slug")
    if not slug:
        errors.append(f"Missing 'name' field in {main_file} frontmatter")
    elif not isinstance(slug, str):
        errors.append(f"'name' field must be a string, got {type(slug).__name__}")
    else:
        if len(slug) > MAX_SLUG_LENGTH:
            errors.append(f"Slug exceeds {MAX_SLUG_LENGTH} characters: '{slug}'")
        if not SLUG_REGEX.match(slug):
            errors.append(
                f"Invalid slug '{slug}': must be lowercase alphanumeric with hyphens, "
                "starting with alphanumeric"
            )

    # --- description field ---
    desc = fm.get("description")
    if not desc:
        errors.append(f"Missing 'description' field in {main_file} frontmatter")

    # --- displayName length ---
    display_name = fm.get("displayName") or fm.get("display_name")
    if display_name and len(str(display_name)) > MAX_DISPLAY_NAME_LENGTH:
        errors.append(
            f"Display name exceeds {MAX_DISPLAY_NAME_LENGTH} characters"
        )

    # --- version format (if present) ---
    version = fm.get("version")
    if version:
        version_str = str(version)
        if not re.match(r"^\d+\.\d+\.\d+$", version_str):
            errors.append(f"Invalid version '{version_str}': must be X.Y.Z semver")

    # --- Collect files ---
    files = _collect_files(directory)

    if not files:
        errors.append("No files found in directory")
        return errors

    # --- File count ---
    if len(files) > MAX_FILE_COUNT:
        errors.append(f"Too many files: {len(files)} (max {MAX_FILE_COUNT})")

    # --- File sizes ---
    total_size = 0
    for rel_path, size in files:
        if size > MAX_FILE_SIZE:
            errors.append(
                f"File '{rel_path}' exceeds {MAX_FILE_SIZE // (1024 * 1024)}MB limit "
                f"({size // (1024 * 1024)}MB)"
            )
        total_size += size

    if total_size > MAX_TOTAL_SIZE:
        errors.append(
            f"Total size exceeds {MAX_TOTAL_SIZE // (1024 * 1024)}MB limit "
            f"({total_size // (1024 * 1024)}MB)"
        )

    # --- Content-type-specific rules ---
    file_paths = [fp for fp, _ in files]

    if kind == "role":
        if len(files) != 1:
            errors.append(
                f"Role must contain exactly one file (ROLE.md), found {len(files)}: "
                + ", ".join(file_paths)
            )
        elif file_paths[0] != "ROLE.md":
            errors.append(f"Role must contain exactly one file: ROLE.md")

    if kind == "skill":
        # Skills only allow text files
        for rel_path, _ in files:
            ext = Path(rel_path).suffix.lower()
            if ext and ext not in SKILL_TEXT_EXTENSIONS:
                errors.append(
                    f"Skill file '{rel_path}' has disallowed extension '{ext}' "
                    "(skills only allow text files)"
                )

    # --- Dependencies ---
    deps = extract_dependencies(fm, kind)
    if deps:
        skill_deps = deps.get("skills", [])
        role_deps = deps.get("roles", [])
        total_deps = len(skill_deps) + len(role_deps)
        if total_deps > MAX_DEPENDENCIES:
            errors.append(
                f"Too many dependencies: {total_deps} (max {MAX_DEPENDENCIES})"
            )
        # Validate dependency slug format
        for dep_slug in skill_deps + role_deps:
            if dep_slug == "*":
                continue  # wildcard is valid for roles
            if not SLUG_REGEX.match(dep_slug):
                errors.append(f"Invalid dependency slug: '{dep_slug}'")

    return errors


@click.group(invoke_without_command=True)
@click.pass_context
def validate(ctx):
    """Validate a package directory before publishing."""
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


def _run_validate(path: str, kind: str) -> None:
    directory = Path(path).resolve()
    if not directory.is_dir():
        print_error(f"Not a directory: {directory}")
        raise SystemExit(1)

    errors = _validate_package(directory, kind)

    if errors:
        print_error(f"Validation failed for {kind} at {directory}")
        for err in errors:
            console.print(f"  [red]\u2717[/red] {err}")
        raise SystemExit(1)
    else:
        file_count = len(_collect_files(directory))
        print_success(f"Valid {kind} ({file_count} file{'s' if file_count != 1 else ''})")


@validate.command("skill")
@click.argument("path", type=click.Path(exists=True, file_okay=False), default=".")
def validate_skill(path):
    """Validate a skill directory."""
    _run_validate(path, "skill")


@validate.command("role")
@click.argument("path", type=click.Path(exists=True, file_okay=False), default=".")
def validate_role(path):
    """Validate a role directory."""
    _run_validate(path, "role")


@validate.command("agent")
@click.argument("path", type=click.Path(exists=True, file_okay=False), default=".")
def validate_agent(path):
    """Validate an agent directory."""
    _run_validate(path, "agent")


@validate.command("memory")
@click.argument("path", type=click.Path(exists=True, file_okay=False), default=".")
def validate_memory(path):
    """Validate a memory directory."""
    _run_validate(path, "memory")


@validate.command("integration")
@click.argument("path", type=click.Path(exists=True, file_okay=False), default=".")
def validate_integration(path):
    """Validate an integration directory."""
    _run_validate(path, "integration")
