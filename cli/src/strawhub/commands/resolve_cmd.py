import json

import click

from strawhub.display import print_error, console
from strawhub.errors import DependencyError
from strawhub.resolver import resolve


@click.command("resolve")
@click.argument("slug")
@click.option(
    "--kind",
    type=click.Choice(["skill", "role"]),
    default=None,
    help="Specify kind (auto-detects if omitted)",
)
@click.option(
    "--version",
    "ver",
    default=None,
    help="Resolve a specific version",
)
@click.option(
    "--global",
    "is_global",
    is_flag=True,
    default=False,
    help="Only search global directory",
)
def resolve_cmd(slug, kind, ver, is_global):
    """Resolve a slug to its installed path and dependency paths.

    Outputs JSON with the resolved package and all transitive
    dependencies, including absolute file paths.
    """
    from strawhub.paths import get_global_root, get_local_root

    try:
        if is_global:
            # Only search global scope
            gr = get_global_root()
            result = resolve(
                slug,
                kind=kind,
                version=ver,
                local_root=gr,  # Use global as both to skip local
                global_root=gr,
            )
        else:
            result = resolve(slug, kind=kind, version=ver)

        console.print_json(json.dumps(result))
    except DependencyError as e:
        print_error(str(e))
        raise SystemExit(1)
