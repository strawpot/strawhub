import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error
from strawhub.errors import StrawHubError


@click.command("set-role")
@click.argument("handle")
@click.argument("role", type=click.Choice(["admin", "moderator", "user"]))
def set_role(handle, role):
    """Set a user's role (admin only)."""
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            client.set_user_role(handle, role)
            print_success(f"Set role for '{handle}' to '{role}'")
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
