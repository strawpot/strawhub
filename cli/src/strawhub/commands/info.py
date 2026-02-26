import json

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_detail, print_error, console
from strawhub.errors import NotFoundError, StrawHubError


@click.command()
@click.argument("slug")
@click.option(
    "--kind",
    type=click.Choice(["skill", "role"]),
    default=None,
    help="Specify kind (auto-detects if omitted)",
)
@click.option(
    "--file",
    "file_path",
    default=None,
    help="View raw content of a specific file (e.g. SKILL.md)",
)
@click.option("--json", "as_json", is_flag=True, default=False, help="Output as JSON")
def info(slug, kind, file_path, as_json):
    """Show detailed information about a skill or role."""
    with StrawHubClient() as client:
        try:
            detected_kind, detail = client.get_info(slug, kind=kind)

            if file_path:
                if detected_kind == "skill":
                    content = client.get_skill_file(slug, path=file_path)
                else:
                    content = client.get_role_file(slug, path=file_path)
                console.print(content)
                return

            if as_json:
                console.print_json(json.dumps(detail))
                return

            print_detail(detected_kind, detail)
        except NotFoundError:
            print_error(f"'{slug}' not found as a skill or role.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)
