import click

from strawhub.client import StrawHubClient
from strawhub.display import print_detail, print_error
from strawhub.errors import NotFoundError, StrawHubError


@click.command()
@click.argument("slug")
@click.option(
    "--kind",
    type=click.Choice(["skill", "role"]),
    default=None,
    help="Specify kind (auto-detects if omitted)",
)
def info(slug, kind):
    """Show detailed information about a skill or role."""
    with StrawHubClient() as client:
        try:
            detected_kind, detail = client.get_info(slug, kind=kind)
            print_detail(detected_kind, detail)
        except NotFoundError:
            print_error(f"'{slug}' not found as a skill or role.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
