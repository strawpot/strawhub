import click

from strawhub.client import StrawHubClient
from strawhub.display import print_user_info, print_error
from strawhub.errors import AuthError, StrawHubError


@click.command()
def whoami():
    """Show current authenticated user."""
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            user = client.whoami()
            print_user_info(user)
        except AuthError:
            print_error("Token is invalid or expired. Run 'strawhub login'.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
