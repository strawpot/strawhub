import json
from pathlib import Path

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error, console
from strawhub.errors import StrawHubError
from strawhub.frontmatter import parse_frontmatter


@click.group(invoke_without_command=True)
@click.pass_context
def publish(ctx):
    """Publish a skill or role to the StrawHub registry."""
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


def _publish_impl(path, kind, ver, changelog, tags):
    directory = Path(path).resolve()

    main_file = "SKILL.md" if kind == "skill" else "ROLE.md"
    main_path = directory / main_file
    if not main_path.exists():
        print_error(f"{main_file} not found in {directory}")
        raise SystemExit(1)

    # Parse frontmatter for metadata
    content = main_path.read_text()
    parsed = parse_frontmatter(content)
    fm = parsed.get("frontmatter", {})

    slug = fm.get("name") or fm.get("slug")
    if not slug:
        print_error(
            f"Missing 'name' or 'slug' in {main_file} frontmatter."
        )
        raise SystemExit(1)

    display_name = fm.get("displayName") or fm.get("display_name") or slug
    version = ver or fm.get("version")
    if not version:
        print_error(
            "Version is required. Use --version or set 'version' in frontmatter."
        )
        raise SystemExit(1)

    if not changelog:
        changelog = fm.get("changelog", "")

    # Build dependencies
    deps = fm.get("dependencies")
    dependencies_json = None
    if deps and isinstance(deps, dict):
        dependencies_json = json.dumps(deps)
    elif deps and isinstance(deps, list):
        if kind == "skill":
            dependencies_json = json.dumps({"skills": deps})
        else:
            dependencies_json = json.dumps({"roles": deps})

    # Collect files
    files = _collect_files(directory)
    if not files:
        print_error("No files found in directory.")
        raise SystemExit(1)

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
            else:
                result = client.publish_role(form_data, files)
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


def _collect_files(directory: Path) -> list[tuple[str, tuple[str, bytes, str]]]:
    """Collect all non-hidden files as httpx-compatible upload tuples."""
    files = []
    for file_path in sorted(directory.rglob("*")):
        if file_path.is_file() and not any(
            part.startswith(".") for part in file_path.relative_to(directory).parts
        ):
            relative = file_path.relative_to(directory).as_posix()
            content = file_path.read_bytes()
            content_type = (
                "text/markdown" if file_path.suffix == ".md" else "application/octet-stream"
            )
            files.append(("files", (relative, content, content_type)))
    return files
