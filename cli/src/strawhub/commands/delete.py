import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error
from strawhub.errors import NotFoundError, StrawHubError


@click.command()
@click.argument("slug")
@click.option(
    "--kind",
    type=click.Choice(["skill", "role"]),
    default=None,
    help="Specify kind (auto-detects if omitted)",
)
@click.option("--yes", is_flag=True, default=False, help="Skip confirmation prompt")
def delete(slug, kind, yes):
    """Delete (soft-delete) a skill or role from the registry (moderator/admin only)."""
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            if kind is None:
                kind, _ = client.get_info(slug)

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
