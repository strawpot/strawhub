import json

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_detail, print_error, console
from strawhub.errors import NotFoundError, StrawHubError


@click.group(invoke_without_command=True)
@click.pass_context
def info(ctx):
    """Show detailed information about a skill or role."""
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


def _info_impl(slug, kind, file_path, as_json):
    with StrawHubClient() as client:
        try:
            _, detail = client.get_info(slug, kind=kind)

            if file_path:
                if kind == "skill":
                    content = client.get_skill_file(slug, path=file_path)
                else:
                    content = client.get_role_file(slug, path=file_path)
                console.print(content)
                return

            if as_json:
                console.print_json(json.dumps(detail))
                return

            print_detail(kind, detail)
        except NotFoundError:
            print_error(f"'{slug}' not found.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)


@info.command("skill")
@click.argument("slug")
@click.option("--file", "file_path", default=None, help="View raw content of a specific file (e.g. SKILL.md)")
@click.option("--json", "as_json", is_flag=True, default=False, help="Output as JSON")
def info_skill(slug, file_path, as_json):
    """Show detailed information about a skill."""
    _info_impl(slug, kind="skill", file_path=file_path, as_json=as_json)


@info.command("role")
@click.argument("slug")
@click.option("--file", "file_path", default=None, help="View raw content of a specific file (e.g. ROLE.md)")
@click.option("--json", "as_json", is_flag=True, default=False, help="Output as JSON")
def info_role(slug, file_path, as_json):
    """Show detailed information about a role."""
    _info_impl(slug, kind="role", file_path=file_path, as_json=as_json)
