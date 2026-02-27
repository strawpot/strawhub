import json

import click

from strawhub.display import print_error, console
from strawhub.errors import DependencyError
from strawhub.resolver import resolve


@click.group("resolve", invoke_without_command=True)
@click.pass_context
def resolve_cmd(ctx):
    """Resolve a slug to its installed path and dependency paths.

    Outputs JSON with the resolved package and all transitive
    dependencies, including absolute file paths.
    """
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


def _resolve_impl(slug, kind, ver, is_global):
    from strawhub.paths import get_global_root, get_local_root

    try:
        if is_global:
            # Only search global scope
            gr = get_global_root()
            result = resolve(
                slug,
                kind=kind,
                version=ver,
                local_root=gr,  # Use global as both to skip local
                global_root=gr,
            )
        else:
            result = resolve(slug, kind=kind, version=ver)

        console.print_json(json.dumps(result))
    except DependencyError as e:
        print_error(str(e))
        raise SystemExit(1)


@resolve_cmd.command("skill")
@click.argument("slug")
@click.option("--version", "ver", default=None, help="Resolve a specific version")
@click.option("--global", "is_global", is_flag=True, default=False, help="Only search global directory")
def resolve_skill(slug, ver, is_global):
    """Resolve a skill to its installed path and dependency paths."""
    _resolve_impl(slug, kind="skill", ver=ver, is_global=is_global)


@resolve_cmd.command("role")
@click.argument("slug")
@click.option("--version", "ver", default=None, help="Resolve a specific version")
@click.option("--global", "is_global", is_flag=True, default=False, help="Only search global directory")
def resolve_role(slug, ver, is_global):
    """Resolve a role to its installed path and dependency paths."""
    _resolve_impl(slug, kind="role", ver=ver, is_global=is_global)
