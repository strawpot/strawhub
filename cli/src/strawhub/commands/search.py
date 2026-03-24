import json

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_search_results, print_error, console
from strawhub.errors import StrawHubError


@click.command()
@click.argument("query", required=False, default=None)
@click.option("--query", "query_opt", default=None, help="Search query (alternative to positional argument).")
@click.option("--kind", type=click.Choice(["skill", "role", "agent", "memory", "integration", "all"]), default="all")
@click.option("--limit", type=int, default=20, help="Max results (1-100)")
@click.option("--json", "as_json", is_flag=True, default=False, help="Output as JSON")
def search(query, query_opt, kind, limit, as_json):
    """Search for skills, roles, agents, memories, and integrations.

    \b
    Examples:
      strawhub search code-reviewer
      strawhub search --query code-reviewer
      strawhub search code-reviewer --kind role
    """
    if query and query_opt and query != query_opt:
        raise click.UsageError(
            f"Conflicting queries: positional '{query}' vs --query '{query_opt}'."
        )
    query = query or query_opt
    if not query:
        raise click.UsageError(
            "Missing search query.\n\n"
            "Usage: strawhub search <query>  or  strawhub search --query <query>"
        )
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
