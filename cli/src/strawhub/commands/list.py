import click

from strawhub.client import StrawHubClient
from strawhub.display import print_list_table, print_error, console
from strawhub.errors import StrawHubError


@click.command("list")
@click.option(
    "--kind",
    type=click.Choice(["skills", "roles", "all"]),
    default="all",
)
@click.option("--limit", type=int, default=50, help="Max results (1-200)")
@click.option(
    "--sort",
    type=click.Choice(["updated", "downloads", "stars"]),
    default="updated",
)
def list_cmd(kind, limit, sort):
    """List skills and/or roles."""
    with StrawHubClient() as client:
        try:
            if kind in ("skills", "all"):
                data = client.list_skills(limit=limit, sort=sort)
                items = data.get("items", [])
                if items:
                    print_list_table(items, "skill")
                elif kind == "skills":
                    console.print("No skills found.")

            if kind in ("roles", "all"):
                data = client.list_roles(limit=limit, sort=sort)
                items = data.get("items", [])
                if items:
                    print_list_table(items, "role")
                elif kind == "roles":
                    console.print("No roles found.")
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
