import shutil

import click

from strawhub.display import print_success, print_error, console
from strawhub.lockfile import Lockfile, PackageRef
from strawhub.paths import (
    get_root,
    get_lockfile_path,
    get_package_dir,
)


@click.command()
@click.argument("slug")
@click.option(
    "--kind",
    type=click.Choice(["skill", "role"]),
    default=None,
    help="Specify kind (auto-detects from lockfile if omitted)",
)
@click.option(
    "--version",
    "ver",
    default=None,
    help="Specific version to remove (removes all versions if omitted)",
)
@click.option(
    "--global",
    "is_global",
    is_flag=True,
    default=False,
    help="Remove from global directory (~/.strawpot or STRAWPOT_HOME)",
)
def uninstall(slug, kind, ver, is_global):
    """Remove an installed skill or role and clean up orphaned dependencies."""
    root = get_root(is_global)
    lockfile_path = get_lockfile_path(root)
    lockfile = Lockfile.load(lockfile_path)

    if not lockfile.packages:
        print_error("No packages installed (lockfile is empty).")
        raise SystemExit(1)

    # Find matching direct installs
    targets = _find_targets(lockfile, slug, kind, ver)
    if not targets:
        print_error(f"'{slug}' is not a direct install. Nothing to remove.")
        raise SystemExit(1)

    # Remove each target from direct installs
    for ref in targets:
        lockfile.remove_direct_install(ref)
        console.print(f"Removed {ref.kind} '{ref.slug}' v{ref.version} from direct installs")

    # Collect orphans (cascading)
    orphans = lockfile.collect_orphans()

    # Remove orphaned packages from disk and lockfile
    for key in orphans:
        pkg = lockfile.packages.get(key)
        if not pkg:
            continue
        pkg_dir = get_package_dir(root, pkg["kind"], pkg["slug"], pkg["version"])
        if pkg_dir.is_dir():
            shutil.rmtree(pkg_dir)
        lockfile.remove_package(key)
        console.print(f"  Removed {pkg['kind']} '{pkg['slug']}' v{pkg['version']}")

    lockfile.save()
    print_success("Uninstall complete.")


def _find_targets(
    lockfile: Lockfile, slug: str, kind: str | None, ver: str | None
) -> list[PackageRef]:
    """Find direct installs matching the given criteria."""
    targets = []
    for ref in lockfile.direct_installs:
        if ref.slug != slug:
            continue
        if kind and ref.kind != kind:
            continue
        if ver and ref.version != ver:
            continue
        targets.append(ref)
    return targets
