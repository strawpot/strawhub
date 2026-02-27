from pathlib import Path

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error, console
from strawhub.errors import NotFoundError, StrawHubError, DependencyError
from strawhub.frontmatter import parse_frontmatter
from strawhub.lockfile import Lockfile, PackageRef
from strawhub.paths import (
    get_root,
    get_local_root,
    get_global_root,
    get_lockfile_path,
    get_package_dir,
    package_exists,
)
from strawhub.version_spec import parse_dependency_spec


@click.group(invoke_without_command=True)
@click.pass_context
def install(ctx):
    """Install a skill or role with all dependencies."""
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


def _install_impl(slug, kind, is_global):
    root = get_root(is_global)
    lockfile = Lockfile.load(get_lockfile_path(root))

    with StrawHubClient() as client:
        try:
            _, detail = client.get_info(slug, kind=kind)
            lv = detail.get("latestVersion")
            if not lv:
                print_error(f"'{slug}' has no published versions.")
                raise SystemExit(1)

            version = lv["version"]
            root_ref = PackageRef(kind=kind, slug=slug, version=version)

            # Check if already installed in either scope
            if _already_installed(root_ref):
                scope = _installed_scope(root_ref)
                console.print(
                    f"'{slug}' v{version} is already installed ({scope})."
                )
                # Still register as direct install if not already
                if not lockfile.is_direct_install(root_ref.key):
                    lockfile.add_package(root_ref)
                    lockfile.add_direct_install(root_ref)
                    lockfile.save()
                return

            # Resolve dependencies
            dep_list = _resolve_deps(client, kind, slug, detail)

            # Install dependencies first (leaves before root)
            for dep in dep_list:
                dep_ref = PackageRef(
                    kind=dep["kind"], slug=dep["slug"], version=dep["version"]
                )
                if _already_installed(dep_ref):
                    # Register in lockfile if in our scope but not tracked
                    if package_exists(root, dep_ref.kind, dep_ref.slug, dep_ref.version):
                        lockfile.add_package(dep_ref, dependent=root_ref)
                    console.print(
                        f"  Skipped {dep['kind']} '{dep['slug']}' v{dep['version']}"
                        " (already installed)"
                    )
                    continue

                _download_package(client, dep["kind"], dep["slug"], dep["version"], root)
                lockfile.add_package(dep_ref, dependent=root_ref)
                console.print(
                    f"  Installed {dep['kind']} '{dep['slug']}' v{dep['version']}"
                )

            # Install the root package
            _download_package(client, kind, slug, version, root)
            lockfile.add_package(root_ref)
            lockfile.add_direct_install(root_ref)
            lockfile.save()
            print_success(f"Installed {kind} '{slug}' v{version}")

        except NotFoundError:
            print_error(f"'{slug}' not found.")
            raise SystemExit(1)
        except (StrawHubError, DependencyError) as e:
            print_error(str(e))
            raise SystemExit(1)


@install.command("skill")
@click.argument("slug")
@click.option(
    "--global",
    "is_global",
    is_flag=True,
    default=False,
    help="Install to global directory (~/.strawpot or STRAWPOT_HOME)",
)
def install_skill(slug, is_global):
    """Install a skill with all dependencies."""
    _install_impl(slug, kind="skill", is_global=is_global)


@install.command("role")
@click.argument("slug")
@click.option(
    "--global",
    "is_global",
    is_flag=True,
    default=False,
    help="Install to global directory (~/.strawpot or STRAWPOT_HOME)",
)
def install_role(slug, is_global):
    """Install a role with all dependencies."""
    _install_impl(slug, kind="role", is_global=is_global)


def _resolve_deps(
    client: StrawHubClient, kind: str, slug: str, detail: dict
) -> list[dict]:
    """Resolve all transitive dependencies for a package.

    For roles, uses the server-side /resolve endpoint.
    For skills, resolves client-side by parsing SKILL.md frontmatter.
    """
    if kind == "role":
        console.print("Resolving dependencies...")
        resolved = client.resolve_role_deps(slug)
        return resolved.get("dependencies", [])
    else:
        # Skills: resolve client-side via frontmatter parsing
        dep_list: list[dict] = []
        visited: set[str] = set()
        _resolve_skill_deps(client, slug, visited, dep_list)
        # Remove the root skill itself from the dep list (it was added by recursion)
        dep_list = [d for d in dep_list if d["slug"] != slug]
        if dep_list:
            console.print("Resolving dependencies...")
        return dep_list


def _resolve_skill_deps(
    client: StrawHubClient,
    slug: str,
    visited: set[str],
    dep_list: list[dict],
) -> None:
    """Recursively resolve skill dependencies by fetching SKILL.md and parsing frontmatter."""
    if slug in visited:
        return
    visited.add(slug)

    try:
        _, detail = client.get_info(slug, kind="skill")
    except NotFoundError:
        raise DependencyError(f"Dependency skill '{slug}' not found in registry")

    lv = detail.get("latestVersion")
    if not lv:
        raise DependencyError(f"Dependency skill '{slug}' has no published versions")

    # Get the SKILL.md content and parse frontmatter for dependencies
    deps = detail.get("dependencies", {})
    skill_deps = deps.get("skills", [])

    # Also check latestVersion.dependencies if top-level is empty
    if not skill_deps and lv.get("dependencies"):
        skill_deps = lv["dependencies"].get("skills", [])

    # Recurse into transitive deps first (DFS, leaves first)
    for dep_spec_str in skill_deps:
        spec = parse_dependency_spec(dep_spec_str)
        _resolve_skill_deps(client, spec.slug, visited, dep_list)

    dep_list.append({
        "kind": "skill",
        "slug": slug,
        "version": lv["version"],
    })


def _already_installed(ref: PackageRef) -> bool:
    """Check if a package exists in either local or global scope."""
    return (
        package_exists(get_local_root(), ref.kind, ref.slug, ref.version)
        or package_exists(get_global_root(), ref.kind, ref.slug, ref.version)
    )


def _installed_scope(ref: PackageRef) -> str:
    """Return 'local' or 'global' indicating where the package is installed."""
    if package_exists(get_local_root(), ref.kind, ref.slug, ref.version):
        return "local"
    return "global"


def _download_package(
    client: StrawHubClient,
    kind: str,
    slug: str,
    version: str,
    root: Path,
) -> None:
    """Download a package's files into root/{kind}s/{slug}-{version}/."""
    target_dir = get_package_dir(root, kind, slug, version)
    target_dir.mkdir(parents=True, exist_ok=True)

    # Fetch detail to get file list
    _, detail = client.get_info(slug, kind=kind)
    lv = detail.get("latestVersion", {})

    for f in lv.get("files", []):
        file_path = f["path"]
        if kind == "skill":
            content = client.get_skill_file(slug, path=file_path)
        else:
            content = client.get_role_file(slug, path=file_path)

        out_file = target_dir / file_path
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(content)
