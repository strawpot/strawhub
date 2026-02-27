import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error
from strawhub.errors import NotFoundError, StrawHubError


@click.group(invoke_without_command=True)
@click.pass_context
def delete(ctx):
    """Delete (soft-delete) a skill or role from the registry (moderator/admin only)."""
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


def _delete_impl(slug, kind, yes):
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            if not yes:
                click.confirm(
                    f"Are you sure you want to delete {kind} '{slug}'?",
                    abort=True,
                )

            client.delete_package(slug, kind)
            print_success(f"Deleted {kind} '{slug}'")
        except click.Abort:
            raise SystemExit(0)
        except NotFoundError:
            print_error(f"'{slug}' not found.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)


@delete.command("skill")
@click.argument("slug")
@click.option("--yes", is_flag=True, default=False, help="Skip confirmation prompt")
def delete_skill(slug, yes):
    """Delete a skill from the registry."""
    _delete_impl(slug, kind="skill", yes=yes)


@delete.command("role")
@click.argument("slug")
@click.option("--yes", is_flag=True, default=False, help="Skip confirmation prompt")
def delete_role(slug, yes):
    """Delete a role from the registry."""
    _delete_impl(slug, kind="role", yes=yes)
