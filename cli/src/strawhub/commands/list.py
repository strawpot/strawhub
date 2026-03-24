import json

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_list_table, print_error, console
from strawhub.errors import StrawHubError


_RESOURCE_KINDS = {
    "skills": ("list_skills", "skill"),
    "roles": ("list_roles", "role"),
    "agents": ("list_agents", "agent"),
    "memories": ("list_memories", "memory"),
    "integrations": ("list_integrations", "integration"),
}

_VALID_KINDS = (*_RESOURCE_KINDS, "all")


@click.command("list")
@click.argument("resource_type", required=False, default=None)
@click.option(
    "--kind",
    type=click.Choice(list(_VALID_KINDS)),
    default=None,
)
@click.option("--limit", type=int, default=50, help="Max results (1-200)")
@click.option(
    "--sort",
    type=click.Choice(["updated", "downloads", "stars"]),
    default="updated",
)
@click.option("--json", "as_json", is_flag=True, default=False, help="Output as JSON")
def list_cmd(resource_type, kind, limit, sort, as_json):
    """List skills, roles, agents, memories, and/or integrations.

    \b
    Optionally pass a resource type as a positional filter:
      strawhub list roles
      strawhub list skills --sort downloads

    This is equivalent to --kind:
      strawhub list --kind roles
    """
    if resource_type:
        if resource_type not in _VALID_KINDS:
            raise click.UsageError(
                f"Unknown resource type '{resource_type}'.\n\n"
                f"Valid types: {', '.join(_VALID_KINDS)}"
            )
        if kind and kind != resource_type:
            raise click.UsageError(
                f"Conflicting filters: positional '{resource_type}' vs --kind '{kind}'."
            )
        kind = resource_type
    kind = kind or "all"

    kinds_to_fetch = _RESOURCE_KINDS if kind == "all" else {kind: _RESOURCE_KINDS[kind]}

    with StrawHubClient() as client:
        try:
            result = {}
            for resource_name, (method_name, display_label) in kinds_to_fetch.items():
                data = getattr(client, method_name)(limit=limit, sort=sort)
                items = data.get("items", [])
                if as_json:
                    result[resource_name] = items
                elif items:
                    print_list_table(items, display_label)
                elif kind != "all":
                    console.print(f"No {resource_name} found.")

            if as_json:
                console.print_json(json.dumps(result))
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
