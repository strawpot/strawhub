import json
from pathlib import Path

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error, console
from strawhub.errors import StrawHubError
from strawhub.frontmatter import parse_frontmatter, extract_dependencies, rewrite_frontmatter_name


@click.group(invoke_without_command=True)
@click.pass_context
def publish(ctx):
    """Publish a skill, role, agent, or memory to the StrawHub registry."""
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


def _publish_impl(path, kind, ver, changelog, tags):
    directory = Path(path).resolve()

    main_file = {"skill": "SKILL.md", "role": "ROLE.md", "agent": "AGENT.md", "memory": "MEMORY.md"}[kind]
    main_path = directory / main_file
    if not main_path.exists():
        print_error(f"{main_file} not found in {directory}")
        raise SystemExit(1)

    # Parse frontmatter for metadata
    content = main_path.read_text(encoding="utf-8")
    parsed = parse_frontmatter(content)
    fm = parsed.get("frontmatter", {})

    slug = fm.get("name") or fm.get("slug")
    if not slug:
        print_error(
            f"Missing 'name' or 'slug' in {main_file} frontmatter."
        )
        raise SystemExit(1)

    # Ensure frontmatter name matches the slug
    name_rewritten = False
    fm_name = fm.get("name")
    if fm_name != slug:
        content = rewrite_frontmatter_name(content, slug)
        name_rewritten = True

    display_name = fm.get("displayName") or fm.get("display_name") or " ".join(
        w.capitalize() for w in slug.split("-")
    )
    version = ver or fm.get("version")
    if not version:
        print_error(
            "Version is required. Use --version or set 'version' in frontmatter."
        )
        raise SystemExit(1)

    if not changelog:
        changelog = fm.get("changelog", "")

    # Build dependencies
    deps = extract_dependencies(fm, kind)
    dependencies_json = None
    if deps:
        dependencies_json = json.dumps(deps)

    # Collect files
    files = _collect_files(directory)
    if not files:
        print_error("No files found in directory.")
        raise SystemExit(1)

    # Patch the main file in-memory if name was rewritten
    if name_rewritten:
        patched = content.encode("utf-8")
        files = [
            ("files", (main_file, patched, "text/markdown"))
            if name == main_file
            else (key, (name, data, ct))
            for key, (name, data, ct) in files
        ]
        console.print(
            f"  [dim]Updated frontmatter name to match slug '{slug}'[/dim]"
        )

    console.print(f"Publishing {kind} '{slug}' v{version}...")
    console.print(f"  Files: {len(files)}")

    # Build form data
    form_data = {
        "slug": slug,
        "displayName": display_name,
        "version": version,
        "changelog": changelog,
    }
    if tags:
        form_data["customTags"] = ",".join(tags)
    if dependencies_json:
        form_data["dependencies"] = dependencies_json

    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            if kind == "skill":
                result = client.publish_skill(form_data, files)
            elif kind == "role":
                result = client.publish_role(form_data, files)
            elif kind == "memory":
                result = client.publish_memory(form_data, files)
            else:
                result = client.publish_agent(form_data, files)
            print_success(
                f"Published {kind} '{slug}' v{result.get('version', version)}"
            )
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)


@publish.command("skill")
@click.argument("path", type=click.Path(exists=True, file_okay=False, dir_okay=True), default=".")
@click.option("--version", "ver", default=None, help="Version to publish")
@click.option("--changelog", default="", help="Changelog for this version")
@click.option("--tag", "tags", multiple=True, help="Custom tags")
def publish_skill(path, ver, changelog, tags):
    """Publish a skill to the StrawHub registry."""
    _publish_impl(path, kind="skill", ver=ver, changelog=changelog, tags=tags)


@publish.command("role")
@click.argument("path", type=click.Path(exists=True, file_okay=False, dir_okay=True), default=".")
@click.option("--version", "ver", default=None, help="Version to publish")
@click.option("--changelog", default="", help="Changelog for this version")
@click.option("--tag", "tags", multiple=True, help="Custom tags")
def publish_role(path, ver, changelog, tags):
    """Publish a role to the StrawHub registry."""
    _publish_impl(path, kind="role", ver=ver, changelog=changelog, tags=tags)


@publish.command("agent")
@click.argument("path", type=click.Path(exists=True, file_okay=False, dir_okay=True), default=".")
@click.option("--version", "ver", default=None, help="Version to publish")
@click.option("--changelog", default="", help="Changelog for this version")
@click.option("--tag", "tags", multiple=True, help="Custom tags")
def publish_agent(path, ver, changelog, tags):
    """Publish an agent to the StrawHub registry."""
    _publish_impl(path, kind="agent", ver=ver, changelog=changelog, tags=tags)


@publish.command("memory")
@click.argument("path", type=click.Path(exists=True, file_okay=False, dir_okay=True), default=".")
@click.option("--version", "ver", default=None, help="Version to publish")
@click.option("--changelog", default="", help="Changelog for this version")
@click.option("--tag", "tags", multiple=True, help="Custom tags")
def publish_memory(path, ver, changelog, tags):
    """Publish a memory to the StrawHub registry."""
    _publish_impl(path, kind="memory", ver=ver, changelog=changelog, tags=tags)


# Keep in sync with convex/lib/publishValidation.ts
MAX_FILE_COUNT = 100
MAX_TOTAL_SIZE = 50 * 1024 * 1024  # 50 MB


def _collect_files(directory: Path) -> list[tuple[str, tuple[str, bytes, str]]]:
    """Collect all non-hidden files as httpx-compatible upload tuples."""
    files = []
    total_size = 0
    for file_path in sorted(directory.rglob("*")):
        if file_path.is_file() and not any(
            part.startswith(".") for part in file_path.relative_to(directory).parts
        ):
            if len(files) >= MAX_FILE_COUNT:
                raise click.ClickException(f"Too many files (max {MAX_FILE_COUNT})")
            relative = file_path.relative_to(directory).as_posix()
            content = file_path.read_bytes()
            total_size += len(content)
            if total_size > MAX_TOTAL_SIZE:
                raise click.ClickException(
                    f"Total size exceeds {MAX_TOTAL_SIZE // (1024 * 1024)}MB limit"
                )
            content_type = (
                "text/markdown" if file_path.suffix == ".md" else "application/octet-stream"
            )
            files.append(("files", (relative, content, content_type)))
    return files
