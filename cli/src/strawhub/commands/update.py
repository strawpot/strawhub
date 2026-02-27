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
from strawhub.tools import run_tool_installs_for_package
from strawhub.version_spec import compare_versions


@click.group(invoke_without_command=True)
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
@click.option(
    "--skip-tools",
    is_flag=True,
    default=False,
    help="Skip running system tool install commands",
)
@click.option(
    "--yes", "-y",
    is_flag=True,
    default=False,
    help="Automatically confirm tool install commands without prompting",
)
@click.pass_context
def update(ctx, update_all, is_global, skip_tools, yes):
    """Update installed skills/roles to their latest versions."""
    if update_all:
        _update_all_impl(is_global, skip_tools=skip_tools, yes=yes)
        return
    if ctx.invoked_subcommand is None:
        click.echo("Specify 'skill <slug>', 'role <slug>', or use --all.")
        ctx.exit(1)


def _update_all_impl(is_global, skip_tools=False, yes=False):
    root = get_root(is_global)
    lockfile = Lockfile.load(get_lockfile_path(root))

    if not lockfile.direct_installs:
        print_error("No packages installed.")
        raise SystemExit(1)

    targets = list(lockfile.direct_installs)
    _update_targets(targets, root, lockfile, skip_tools=skip_tools, yes=yes)


def _update_one_impl(slug, kind, is_global, skip_tools=False, yes=False):
    root = get_root(is_global)
    lockfile = Lockfile.load(get_lockfile_path(root))

    if not lockfile.direct_installs:
        print_error("No packages installed.")
        raise SystemExit(1)

    targets = [r for r in lockfile.direct_installs if r.slug == slug and r.kind == kind]
    if not targets:
        print_error(f"{kind} '{slug}' is not installed as a direct install.")
        raise SystemExit(1)

    _update_targets(targets, root, lockfile, skip_tools=skip_tools, yes=yes)


def _update_targets(targets, root, lockfile, skip_tools=False, yes=False):
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

                # Run tool installs (non-fatal)
                if not skip_tools:
                    seen: set[str] = set()
                    all_results: list[dict] = []
                    for dep in dep_list:
                        results = run_tool_installs_for_package(
                            root, dep["kind"], dep["slug"], dep["version"],
                            yes=yes, seen=seen,
                        )
                        all_results.extend(results)
                    results = run_tool_installs_for_package(
                        root, ref.kind, ref.slug, latest_version,
                        yes=yes, seen=seen,
                    )
                    all_results.extend(results)
                    failed = [r for r in all_results if r["status"] == "failed"]
                    if failed:
                        names = ", ".join(r["tool"] for r in failed)
                        console.print(
                            f"\n[yellow]Note:[/yellow] Some tools failed to install: "
                            f"{names}. Run 'strawhub install-tools' to retry."
                        )

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


@update.command("skill")
@click.argument("slug")
@click.option("--global", "is_global", is_flag=True, default=False, help="Update global packages (~/.strawpot or STRAWPOT_HOME)")
@click.option("--skip-tools", is_flag=True, default=False, help="Skip running system tool install commands")
@click.option("--yes", "-y", is_flag=True, default=False, help="Automatically confirm tool install commands without prompting")
def update_skill(slug, is_global, skip_tools, yes):
    """Update an installed skill to its latest version."""
    _update_one_impl(slug, kind="skill", is_global=is_global, skip_tools=skip_tools, yes=yes)


@update.command("role")
@click.argument("slug")
@click.option("--global", "is_global", is_flag=True, default=False, help="Update global packages (~/.strawpot or STRAWPOT_HOME)")
@click.option("--skip-tools", is_flag=True, default=False, help="Skip running system tool install commands")
@click.option("--yes", "-y", is_flag=True, default=False, help="Automatically confirm tool install commands without prompting")
def update_role(slug, is_global, skip_tools, yes):
    """Update an installed role to its latest version."""
    _update_one_impl(slug, kind="role", is_global=is_global, skip_tools=skip_tools, yes=yes)
