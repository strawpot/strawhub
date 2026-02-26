import json

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_user_info, print_error, console
from strawhub.errors import AuthError, StrawHubError


@click.command()
@click.option("--json", "as_json", is_flag=True, default=False, help="Output as JSON")
def whoami(as_json):
    """Show current authenticated user."""
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            user = client.whoami()
            if as_json:
                console.print_json(json.dumps(user))
                return
            print_user_info(user)
        except AuthError:
            print_error("Token is invalid or expired. Run 'strawhub login'.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
