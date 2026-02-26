import shutil

import click

from strawhub.client import StrawHubClient
from strawhub.commands.install import _download_package, _resolve_deps
from strawhub.display import print_success, print_error, console
from strawhub.errors import NotFoundError, StrawHubError
from strawhub.lockfile import Lockfile, PackageRef
from strawhub.paths import (
    get_root,
    get_lockfile_path,
    get_package_dir,
    package_exists,
)
from strawhub.version_spec import compare_versions


@click.command()
@click.argument("slug", required=False, default=None)
@click.option(
    "--all",
    "update_all",
    is_flag=True,
    default=False,
    help="Update all installed packages",
)
@click.option(
    "--global",
    "is_global",
    is_flag=True,
    default=False,
    help="Update global packages (~/.strawpot or STRAWPOT_HOME)",
)
def update(slug, update_all, is_global):
    """Update installed skills/roles to their latest versions."""
    if not slug and not update_all:
        print_error("Specify a slug or use --all to update everything.")
        raise SystemExit(1)

    root = get_root(is_global)
    lockfile = Lockfile.load(get_lockfile_path(root))

    if not lockfile.direct_installs:
        print_error("No packages installed.")
        raise SystemExit(1)

    # Determine which packages to check
    if update_all:
        targets = list(lockfile.direct_installs)
    else:
        targets = [r for r in lockfile.direct_installs if r.slug == slug]
        if not targets:
            print_error(f"'{slug}' is not installed as a direct install.")
            raise SystemExit(1)

    updated_count = 0

    with StrawHubClient() as client:
        for ref in targets:
            try:
                _, detail = client.get_info(ref.slug, kind=ref.kind)
                lv = detail.get("latestVersion")
                if not lv:
                    console.print(f"  {ref.kind} '{ref.slug}': no published versions")
                    continue

                latest_version = lv["version"]
                cmp = compare_versions(latest_version, ref.version)
                if cmp <= 0:
                    console.print(
                        f"  {ref.kind} '{ref.slug}' v{ref.version} is up to date"
                    )
                    continue

                console.print(
                    f"  Updating {ref.kind} '{ref.slug}' "
                    f"v{ref.version} -> v{latest_version}..."
                )

                # Resolve and install new dependencies
                new_ref = PackageRef(
                    kind=ref.kind, slug=ref.slug, version=latest_version
                )
                dep_list = _resolve_deps(client, ref.kind, ref.slug, detail)

                for dep in dep_list:
                    dep_ref = PackageRef(
                        kind=dep["kind"], slug=dep["slug"], version=dep["version"]
                    )
                    if package_exists(root, dep_ref.kind, dep_ref.slug, dep_ref.version):
                        lockfile.add_package(dep_ref, dependent=new_ref)
                        continue
                    _download_package(
                        client, dep["kind"], dep["slug"], dep["version"], root
                    )
                    lockfile.add_package(dep_ref, dependent=new_ref)

                # Download the new version
                _download_package(client, ref.kind, ref.slug, latest_version, root)
                lockfile.add_package(new_ref)
                lockfile.add_direct_install(new_ref)

                # Remove old version from direct installs
                lockfile.remove_direct_install(ref)

                # Clean up old version if orphaned
                orphans = lockfile.collect_orphans()
                for key in orphans:
                    pkg = lockfile.packages.get(key)
                    if not pkg:
                        continue
                    pkg_dir = get_package_dir(
                        root, pkg["kind"], pkg["slug"], pkg["version"]
                    )
                    if pkg_dir.is_dir():
                        shutil.rmtree(pkg_dir)
                    lockfile.remove_package(key)

                updated_count += 1

            except NotFoundError:
                print_error(f"  '{ref.slug}' not found in registry.")
            except StrawHubError as e:
                print_error(f"  Failed to update '{ref.slug}': {e}")

    lockfile.save()
    if updated_count:
        print_success(f"Updated {updated_count} package(s).")
    else:
        console.print("Everything is up to date.")
