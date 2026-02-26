import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error
from strawhub.errors import StrawHubError


@click.command("ban-user")
@click.argument("handle")
@click.option("--reason", default=None, help="Reason for the ban")
@click.option("--unban", is_flag=True, default=False, help="Unban the user instead")
def ban_user(handle, reason, unban):
    """Ban or unban a user (admin only)."""
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            if unban:
                client.ban_user(handle, blocked=False)
                print_success(f"Unbanned user '{handle}'")
            else:
                client.ban_user(handle, blocked=True, reason=reason)
                print_success(f"Banned user '{handle}'")
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
