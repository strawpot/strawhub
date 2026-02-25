import click

from strawhub.client import StrawHubClient
from strawhub.config import set_token
from strawhub.display import print_user_info, print_success, print_error
from strawhub.errors import StrawHubError


@click.command()
def login():
    """Authenticate with your StrawHub API token."""
    click.echo("Get your API token from: https://strawhub.dev/settings")
    token = click.prompt("API token", hide_input=True)

    if not token.startswith("sh_"):
        print_error("Invalid token format. Tokens start with 'sh_'.")
        raise SystemExit(1)

    with StrawHubClient(token=token) as client:
        try:
            user = client.whoami()
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)

    set_token(token)
    print_success("Logged in successfully!")
    print_user_info(user)
