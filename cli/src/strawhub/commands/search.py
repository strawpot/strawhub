import json

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_search_results, print_error, console
from strawhub.errors import StrawHubError


@click.command()
@click.argument("query")
@click.option("--kind", type=click.Choice(["skill", "role", "all"]), default="all")
@click.option("--limit", type=int, default=20, help="Max results (1-100)")
@click.option("--json", "as_json", is_flag=True, default=False, help="Output as JSON")
def search(query, kind, limit, as_json):
    """Search for skills and roles."""
    with StrawHubClient() as client:
        try:
            data = client.search(query, kind=kind, limit=limit)
            if as_json:
                console.print_json(json.dumps(data))
                return
            results = data.get("results", [])
            if not results:
                console.print("No results found.")
                return
            print_search_results(results)
            console.print(f"\n{data['count']} result(s) found.")
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
