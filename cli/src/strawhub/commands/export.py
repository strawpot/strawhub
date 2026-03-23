"""Export a StrawHub role for use in vanilla Claude Code (without StrawPot).

Fetches a role and its skill dependencies from the registry, strips
StrawPot-specific metadata, inlines skill content, and produces a single
Markdown file that can be added to a project's CLAUDE.md or .claude/ directory.
"""

import re
from pathlib import Path

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_error, print_success, error_console
from strawhub.errors import NotFoundError, StrawHubError
from strawhub.frontmatter import parse_frontmatter, extract_dependencies


def _strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter from Markdown content."""
    parsed = parse_frontmatter(content)
    return parsed["body"].lstrip("\n")


def _clean_strawpot_references(content: str) -> str:
    """Remove or soften StrawPot-specific references in role/skill content.

    Replaces denden delegation instructions with user-friendly alternatives
    and removes StrawPot runtime assumptions.
    """
    # Replace "delegate to <role>" patterns with user guidance
    content = re.sub(
        r"[Dd]elegate to [`'\"]?(\w[\w-]*)[`'\"]? (?:via|using|through) denden",
        r"hand off to a separate session using the \1 role instructions",
        content,
    )
    # Remove lines that are purely about denden usage
    lines = content.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip().lower()
        if stripped.startswith("use") and "denden" in stripped and "delegate" in stripped:
            continue
        cleaned.append(line)
    return "\n".join(cleaned)


def _build_export(
    role_content: str,
    skill_contents: dict[str, str],
    slug: str,
    version: str,
    failed_skills: list[str] | None = None,
) -> str:
    """Assemble the final exported Markdown document."""
    parts = []

    # Header with provenance
    parts.append(
        f"<!-- Exported from StrawHub: role '{slug}' v{version} -->\n"
        f"<!-- Install: strawhub export role {slug} > .claude/roles/{slug}.md -->\n"
        f"<!-- Registry: https://strawhub.dev/roles/{slug} -->\n"
    )

    # Warn about failed skill fetches
    if failed_skills:
        for skill_slug in failed_skills:
            parts.append(
                f"<!-- WARNING: Failed to fetch skill '{skill_slug}' "
                f"-- export may be incomplete -->\n"
            )

    # Role content (frontmatter stripped)
    role_body = _strip_frontmatter(role_content)
    role_body = _clean_strawpot_references(role_body)
    parts.append(role_body.rstrip("\n"))

    # Inlined skill dependencies
    if skill_contents:
        parts.append("\n\n---\n")
        parts.append("<!-- Inlined skill dependencies -->\n")
        for i, (skill_slug, skill_content) in enumerate(skill_contents.items()):
            skill_body = _strip_frontmatter(skill_content)
            skill_body = _clean_strawpot_references(skill_body)
            if i > 0:
                parts.append("")  # blank line separator between skills
            parts.append(skill_body.rstrip("\n"))

    return "\n".join(parts) + "\n"


def _export_role(slug, output, no_skills, ver):
    """Fetch a role from StrawHub and export it as standalone Markdown."""
    with StrawHubClient() as client:
        try:
            # Fetch role info
            _, detail = client.get_info(slug, kind="role", version=ver)
            lv = detail.get("latestVersion")
            if not lv or not isinstance(lv, dict) or "version" not in lv:
                print_error(f"Role '{slug}' has no published versions.")
                raise SystemExit(1)

            # Use requested version if specified, otherwise latest
            version = ver or lv["version"]

            # Fetch role content
            role_content = client.get_role_file(slug, version=ver)

            # Fetch skill dependencies
            skill_contents: dict[str, str] = {}
            failed_skills: list[str] = []
            if not no_skills:
                parsed = parse_frontmatter(role_content)
                deps = extract_dependencies(parsed["frontmatter"], "role")
                skill_slugs = deps.get("skills", []) if deps else []

                for skill_slug in skill_slugs:
                    try:
                        skill_content = client.get_skill_file(skill_slug)
                        skill_contents[skill_slug] = skill_content
                    except NotFoundError:
                        failed_skills.append(skill_slug)
                        error_console.print(
                            f"[yellow]Warning:[/yellow] Skill '{skill_slug}' "
                            "not found, skipping."
                        )
                    except StrawHubError as e:
                        failed_skills.append(skill_slug)
                        error_console.print(
                            f"[yellow]Warning:[/yellow] Could not fetch "
                            f"skill '{skill_slug}': {e}"
                        )

            # Build export
            exported = _build_export(
                role_content, skill_contents, slug, version,
                failed_skills=failed_skills or None,
            )

            # Output
            if output:
                try:
                    out_path = Path(output)
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    out_path.write_text(exported, encoding="utf-8")
                except OSError as e:
                    print_error(f"Cannot write to {output}: {e}")
                    raise SystemExit(1)
                print_success(
                    f"Exported role '{slug}' v{version} to {out_path}",
                )
                if skill_contents:
                    error_console.print(
                        f"  Inlined {len(skill_contents)} skill(s): "
                        + ", ".join(skill_contents.keys())
                    )
                error_console.print(
                    f"\n[dim]Add to your CLAUDE.md or use as "
                    f".claude/roles/{slug}.md[/dim]"
                )
            else:
                click.echo(exported, nl=False)

            # Track the download
            client.track_download("role", slug, version=version)

        except NotFoundError:
            print_error(f"Role '{slug}' not found on StrawHub.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)


@click.group(invoke_without_command=True)
@click.pass_context
def export(ctx):
    """Export a role for use in Claude Code without StrawPot.

    Fetches the role from StrawHub, strips StrawPot-specific metadata,
    inlines skill dependencies, and outputs a single Markdown file.
    """
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


@export.command("role")
@click.argument("slug")
@click.option(
    "--output", "-o",
    type=click.Path(),
    default=None,
    help="Write output to a file instead of stdout.",
)
@click.option(
    "--no-skills",
    is_flag=True,
    default=False,
    help="Skip inlining skill dependencies.",
)
@click.option(
    "--version",
    "ver",
    default=None,
    help="Export a specific version.",
)
def export_role(slug, output, no_skills, ver):
    """Export a role for use in Claude Code without StrawPot.

    \b
    Examples:
        strawhub export role code-reviewer
        strawhub export role code-reviewer -o .claude/roles/code-reviewer.md
        strawhub export role code-reviewer --no-skills
    """
    _export_role(slug, output, no_skills, ver)
