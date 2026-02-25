from pathlib import Path

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error, console
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
    "--dir",
    "output_dir",
    type=click.Path(),
    default=".",
    help="Output directory (default: current)",
)
@click.option(
    "--with-deps",
    is_flag=True,
    default=False,
    help="Also install dependencies (roles only)",
)
def install(slug, kind, output_dir, with_deps):
    """Install a skill or role by downloading its files."""
    base = Path(output_dir)

    with StrawHubClient() as client:
        try:
            detected_kind, detail = client.get_info(slug, kind=kind)
            lv = detail.get("latestVersion")
            if not lv:
                print_error(f"'{slug}' has no published versions.")
                raise SystemExit(1)

            _download_item(client, detected_kind, slug, lv, base)
            print_success(f"Installed {detected_kind} '{slug}' v{lv['version']}")

            if detected_kind == "role" and with_deps:
                console.print("Resolving dependencies...")
                resolved = client.resolve_role_deps(slug)
                for dep in resolved.get("dependencies", []):
                    dep_kind = dep["kind"]
                    dep_slug = dep["slug"]
                    _, dep_detail = client.get_info(dep_slug, kind=dep_kind)
                    dep_lv = dep_detail.get("latestVersion")
                    if dep_lv:
                        _download_item(client, dep_kind, dep_slug, dep_lv, base)
                        console.print(
                            f"  Installed {dep_kind} '{dep_slug}' v{dep_lv['version']}"
                        )

        except NotFoundError:
            print_error(f"'{slug}' not found.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)


def _download_item(
    client: StrawHubClient,
    kind: str,
    slug: str,
    latest_version: dict,
    base: Path,
) -> None:
    target_dir = base / f"{kind}s" / slug
    target_dir.mkdir(parents=True, exist_ok=True)

    for f in latest_version.get("files", []):
        file_path = f["path"]
        if kind == "skill":
            content = client.get_skill_file(slug, path=file_path)
        else:
            content = client.get_role_file(slug, path=file_path)

        out_file = target_dir / file_path
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(content)
