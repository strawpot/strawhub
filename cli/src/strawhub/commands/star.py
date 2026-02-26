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
def star(slug, kind):
    """Star a skill or role."""
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            if kind is None:
                kind, _ = client.get_info(slug)
            result = client.toggle_star(slug, kind)
            if result.get("starred"):
                print_success(f"Starred {kind} '{slug}'")
            else:
                # Was already starred (toggle removed it), toggle again
                client.toggle_star(slug, kind)
                print_success(f"Starred {kind} '{slug}'")
        except NotFoundError:
            print_error(f"'{slug}' not found.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)


@click.command()
@click.argument("slug")
@click.option(
    "--kind",
    type=click.Choice(["skill", "role"]),
    default=None,
    help="Specify kind (auto-detects if omitted)",
)
def unstar(slug, kind):
    """Remove star from a skill or role."""
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            if kind is None:
                kind, _ = client.get_info(slug)
            result = client.toggle_star(slug, kind)
            if not result.get("starred"):
                print_success(f"Unstarred {kind} '{slug}'")
            else:
                # Was not starred (toggle added it), toggle again
                client.toggle_star(slug, kind)
                print_success(f"Unstarred {kind} '{slug}'")
        except NotFoundError:
            print_error(f"'{slug}' not found.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
