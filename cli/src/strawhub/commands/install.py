import shutil
from pathlib import Path

import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error, console
from strawhub.errors import NotFoundError, StrawHubError, DependencyError
from strawhub.lockfile import Lockfile, PackageRef
from strawhub.paths import (
    get_root,
    get_local_root,
    get_global_root,
    get_lockfile_path,
    get_package_dir,
    get_project_file_path,
    find_installed_versions,
    package_exists,
)
from strawhub.project_file import ProjectFile
from strawhub.tools import run_tool_installs_for_package
from strawhub.version_spec import (
    DependencySpec,
    extract_slug,
    parse_constraint,
    parse_version,
    compare_versions,
    satisfies_version,
)


@click.group(invoke_without_command=True)
@click.option(
    "--skip-tools",
    is_flag=True,
    default=False,
    help="Skip running system tool install commands",
)
@click.option(
    "--yes",
    "-y",
    is_flag=True,
    default=False,
    help="Automatically confirm tool install commands without prompting",
)
@click.pass_context
def install(ctx, skip_tools, yes):
    """Install a skill or role with all dependencies.

    When called without a subcommand, installs all dependencies from
    strawpot.toml in the current directory.
    """
    if ctx.invoked_subcommand is None:
        _install_from_project_file(skip_tools=skip_tools, yes=yes)


def _install_impl(
    slug,
    kind,
    is_global,
    skip_tools=False,
    yes=False,
    update=False,
    recursive=False,
    version=None,
    force=False,
    save=False,
    save_exact=False,
):
    root = get_root(is_global)
    lockfile = Lockfile.load(get_lockfile_path(root))

    with StrawHubClient() as client:
        try:
            # Determine target version
            if version:
                target_version = version
                _, detail = client.get_info(slug, kind=kind, version=version)
                lv = detail.get("latestVersion")
                if not lv:
                    print_error(f"'{slug}' has no published versions.")
                    raise SystemExit(1)
                # Validate server returned the requested version
                if lv["version"] != version:
                    print_error(
                        f"Version {version} of '{slug}' is not available. "
                        f"Latest version is {lv['version']}."
                    )
                    raise SystemExit(1)
            else:
                _, detail = client.get_info(slug, kind=kind)
                lv = detail.get("latestVersion")
                if not lv:
                    print_error(f"'{slug}' has no published versions.")
                    raise SystemExit(1)
                target_version = lv["version"]

            root_ref = PackageRef(kind=kind, slug=slug, version=target_version)

            # Check existing installation
            existing_in_scope = _slug_installed_in_scope(root, kind, slug)

            if version:
                # --version: install specific version
                if existing_in_scope:
                    if not force:
                        print_error(
                            f"'{slug}' v{existing_in_scope} is already installed. "
                            "Use --force to replace."
                        )
                        raise SystemExit(1)
                    _remove_from_scope(root, lockfile, kind, slug)
            elif update:
                # --update: update to latest
                if existing_in_scope:
                    cmp = compare_versions(
                        parse_version(target_version),
                        parse_version(existing_in_scope),
                    )
                    if cmp <= 0:
                        console.print(
                            f"'{slug}' v{existing_in_scope} is already up to date."
                        )
                        # Ensure registered as direct install
                        existing_ref = PackageRef(
                            kind=kind, slug=slug, version=existing_in_scope
                        )
                        if not lockfile.is_direct_install(existing_ref.key):
                            lockfile.add_package(existing_ref)
                            lockfile.add_direct_install(existing_ref)
                            lockfile.save()
                        return
                    _remove_from_scope(root, lockfile, kind, slug)
                # If not installed, fall through to normal install
            else:
                # Normal install: skip if slug exists in any scope
                if _slug_installed_anywhere(kind, slug):
                    found = _find_slug_anywhere(kind, slug)
                    if found:
                        found_root, found_version = found
                        scope = "local" if found_root == get_local_root() else "global"
                        console.print(
                            f"'{slug}' v{found_version} is already installed ({scope})."
                        )
                        # Register as direct install if in our scope
                        if package_exists(root, kind, slug, found_version):
                            existing_ref = PackageRef(
                                kind=kind, slug=slug, version=found_version
                            )
                            if not lockfile.is_direct_install(existing_ref.key):
                                lockfile.add_package(existing_ref)
                                lockfile.add_direct_install(existing_ref)
                                lockfile.save()
                    return

            # Resolve and install dependencies
            dep_list = _resolve_deps(client, kind, slug, detail)
            installed_deps = []

            for dep in dep_list:
                dep_slug = dep["slug"]
                dep_kind = dep["kind"]
                dep_version = dep["version"]  # latest from registry

                existing_dep_in_scope = _slug_installed_in_scope(
                    root, dep_kind, dep_slug
                )
                existing_dep_anywhere = _find_slug_anywhere(dep_kind, dep_slug)

                if update and recursive and existing_dep_in_scope:
                    # --update --recursive: update dep in target scope if outdated
                    cmp = compare_versions(
                        parse_version(dep_version),
                        parse_version(existing_dep_in_scope),
                    )
                    if cmp > 0:
                        _remove_from_scope(root, lockfile, dep_kind, dep_slug)
                        _download_package(
                            client, dep_kind, dep_slug, dep_version, root
                        )
                        dep_ref = PackageRef(
                            kind=dep_kind, slug=dep_slug, version=dep_version
                        )
                        lockfile.add_package(dep_ref, dependent=root_ref)
                        installed_deps.append(dep)
                        console.print(
                            f"  Updated {dep_kind} '{dep_slug}' "
                            f"v{existing_dep_in_scope} -> v{dep_version}"
                        )
                    else:
                        dep_ref = PackageRef(
                            kind=dep_kind,
                            slug=dep_slug,
                            version=existing_dep_in_scope,
                        )
                        if package_exists(
                            root, dep_kind, dep_slug, existing_dep_in_scope
                        ):
                            lockfile.add_package(dep_ref, dependent=root_ref)
                        installed_deps.append(
                            {
                                "kind": dep_kind,
                                "slug": dep_slug,
                                "version": existing_dep_in_scope,
                            }
                        )
                        console.print(
                            f"  Skipped {dep_kind} '{dep_slug}' "
                            f"v{existing_dep_in_scope} (up to date)"
                        )
                elif existing_dep_anywhere:
                    # Skip: already installed in some scope
                    _, dep_ver = existing_dep_anywhere
                    if package_exists(root, dep_kind, dep_slug, dep_ver):
                        dep_ref = PackageRef(
                            kind=dep_kind, slug=dep_slug, version=dep_ver
                        )
                        lockfile.add_package(dep_ref, dependent=root_ref)
                    installed_deps.append(
                        {"kind": dep_kind, "slug": dep_slug, "version": dep_ver}
                    )
                    console.print(
                        f"  Skipped {dep_kind} '{dep_slug}' v{dep_ver}"
                        " (already installed)"
                    )
                else:
                    # Not installed anywhere: download
                    _download_package(
                        client, dep_kind, dep_slug, dep_version, root
                    )
                    dep_ref = PackageRef(
                        kind=dep_kind, slug=dep_slug, version=dep_version
                    )
                    lockfile.add_package(dep_ref, dependent=root_ref)
                    installed_deps.append(dep)
                    console.print(
                        f"  Installed {dep_kind} '{dep_slug}' v{dep_version}"
                    )

            # Install the root package
            _download_package(
                client, kind, slug, target_version, root, version=version
            )
            lockfile.add_package(root_ref)
            lockfile.add_direct_install(root_ref)

            # Clean up orphans (from removed old versions)
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

            lockfile.save()
            print_success(f"Installed {kind} '{slug}' v{target_version}")

            # Save to project file if requested
            if save or save_exact:
                pf = ProjectFile.load(get_project_file_path())
                pf.add_dependency(kind, slug, target_version, exact=save_exact)
                pf.save()
                constraint = f"=={target_version}" if save_exact else f"^{target_version}"
                console.print(
                    f"Saved {kind} '{slug}' ({constraint}) to strawpot.toml"
                )

            # Run tool installs (non-fatal)
            if not skip_tools:
                seen: set[str] = set()
                all_results: list[dict] = []
                for dep in installed_deps:
                    results = run_tool_installs_for_package(
                        root,
                        dep["kind"],
                        dep["slug"],
                        dep["version"],
                        yes=yes,
                        seen=seen,
                    )
                    all_results.extend(results)
                results = run_tool_installs_for_package(
                    root, kind, slug, target_version, yes=yes, seen=seen
                )
                all_results.extend(results)
                failed = [r for r in all_results if r["status"] == "failed"]
                if failed:
                    names = ", ".join(r["tool"] for r in failed)
                    console.print(
                        f"\n[yellow]Note:[/yellow] Some tools failed to install: "
                        f"{names}. Run 'strawhub install-tools' to retry."
                    )

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
@click.option(
    "--skip-tools",
    is_flag=True,
    default=False,
    help="Skip running system tool install commands",
)
@click.option(
    "--yes",
    "-y",
    is_flag=True,
    default=False,
    help="Automatically confirm tool install commands without prompting",
)
@click.option(
    "--update",
    is_flag=True,
    default=False,
    help="Update to the latest version if already installed",
)
@click.option(
    "--recursive",
    is_flag=True,
    default=False,
    help="With --update, also update all dependencies to latest",
)
@click.option(
    "--version",
    "ver",
    default=None,
    help="Install a specific version",
)
@click.option(
    "--force",
    is_flag=True,
    default=False,
    help="With --version, force replace an existing installation",
)
@click.option(
    "--save",
    is_flag=True,
    default=False,
    help="Save dependency to strawpot.toml with ^X.Y.Z constraint",
)
@click.option(
    "--save-exact",
    is_flag=True,
    default=False,
    help="Save dependency to strawpot.toml with ==X.Y.Z constraint",
)
def install_skill(slug, is_global, skip_tools, yes, update, recursive, ver, force, save, save_exact):
    """Install a skill with all dependencies."""
    if recursive and not update:
        print_error("--recursive requires --update")
        raise SystemExit(1)
    if force and not ver:
        print_error("--force requires --version")
        raise SystemExit(1)
    if update and ver:
        print_error("--update and --version cannot be used together")
        raise SystemExit(1)
    if save and save_exact:
        print_error("--save and --save-exact cannot be used together")
        raise SystemExit(1)
    if (save or save_exact) and is_global:
        print_error("--save/--save-exact cannot be used with --global")
        raise SystemExit(1)
    _install_impl(
        slug,
        kind="skill",
        is_global=is_global,
        skip_tools=skip_tools,
        yes=yes,
        update=update,
        recursive=recursive,
        version=ver,
        force=force,
        save=save,
        save_exact=save_exact,
    )


@install.command("role")
@click.argument("slug")
@click.option(
    "--global",
    "is_global",
    is_flag=True,
    default=False,
    help="Install to global directory (~/.strawpot or STRAWPOT_HOME)",
)
@click.option(
    "--skip-tools",
    is_flag=True,
    default=False,
    help="Skip running system tool install commands",
)
@click.option(
    "--yes",
    "-y",
    is_flag=True,
    default=False,
    help="Automatically confirm tool install commands without prompting",
)
@click.option(
    "--update",
    is_flag=True,
    default=False,
    help="Update to the latest version if already installed",
)
@click.option(
    "--recursive",
    is_flag=True,
    default=False,
    help="With --update, also update all dependencies to latest",
)
@click.option(
    "--version",
    "ver",
    default=None,
    help="Install a specific version",
)
@click.option(
    "--force",
    is_flag=True,
    default=False,
    help="With --version, force replace an existing installation",
)
@click.option(
    "--save",
    is_flag=True,
    default=False,
    help="Save dependency to strawpot.toml with ^X.Y.Z constraint",
)
@click.option(
    "--save-exact",
    is_flag=True,
    default=False,
    help="Save dependency to strawpot.toml with ==X.Y.Z constraint",
)
def install_role(slug, is_global, skip_tools, yes, update, recursive, ver, force, save, save_exact):
    """Install a role with all dependencies."""
    if recursive and not update:
        print_error("--recursive requires --update")
        raise SystemExit(1)
    if force and not ver:
        print_error("--force requires --version")
        raise SystemExit(1)
    if update and ver:
        print_error("--update and --version cannot be used together")
        raise SystemExit(1)
    if save and save_exact:
        print_error("--save and --save-exact cannot be used together")
        raise SystemExit(1)
    if (save or save_exact) and is_global:
        print_error("--save/--save-exact cannot be used with --global")
        raise SystemExit(1)
    _install_impl(
        slug,
        kind="role",
        is_global=is_global,
        skip_tools=skip_tools,
        yes=yes,
        update=update,
        recursive=recursive,
        version=ver,
        force=force,
        save=save,
        save_exact=save_exact,
    )


# ── Dependency resolution ─────────────────────────────────────────────────────


def _resolve_deps(
    client: StrawHubClient, kind: str, slug: str, detail: dict
) -> list[dict]:
    """Resolve all transitive dependencies for a package.

    For roles, uses the server-side /resolve endpoint.
    For skills, resolves client-side by parsing SKILL.md frontmatter.
    Dependencies are just slugs; always resolves to latest version.
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
        # Remove the root skill itself from the dep list
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
    """Recursively resolve skill dependencies by fetching info and parsing deps."""
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

    # Get dependency slugs
    deps = detail.get("dependencies", {})
    skill_deps = deps.get("skills", [])

    # Also check latestVersion.dependencies if top-level is empty
    if not skill_deps and lv.get("dependencies"):
        skill_deps = lv["dependencies"].get("skills", [])

    # Recurse into transitive deps first (DFS, leaves first)
    for dep_slug_raw in skill_deps:
        dep_slug = extract_slug(dep_slug_raw)
        _resolve_skill_deps(client, dep_slug, visited, dep_list)

    dep_list.append({
        "kind": "skill",
        "slug": slug,
        "version": lv["version"],
    })


# ── Slug-based installation helpers ───────────────────────────────────────────


def _slug_installed_in_scope(root: Path, kind: str, slug: str) -> str | None:
    """Return the installed version of a slug in a specific scope, or None.

    Assumes one version per slug per scope. If multiple exist (legacy),
    returns the highest.
    """
    versions = find_installed_versions(root, kind, slug)
    if not versions:
        return None
    versions.sort(key=parse_version, reverse=True)
    return versions[0]


def _slug_installed_anywhere(kind: str, slug: str) -> bool:
    """Check if any version of this slug is installed in either scope."""
    return bool(
        find_installed_versions(get_local_root(), kind, slug)
        or find_installed_versions(get_global_root(), kind, slug)
    )


def _find_slug_anywhere(kind: str, slug: str) -> tuple[Path, str] | None:
    """Find the installed version of a slug, checking local first then global.

    Returns (root, version) or None.
    """
    for root in (get_local_root(), get_global_root()):
        version = _slug_installed_in_scope(root, kind, slug)
        if version:
            return (root, version)
    return None


def _remove_from_scope(
    root: Path, lockfile: Lockfile, kind: str, slug: str
) -> str | None:
    """Remove the installed version of a slug from a specific scope.

    Removes from disk and lockfile. Returns the removed version or None.
    """
    version = _slug_installed_in_scope(root, kind, slug)
    if not version:
        return None
    pkg_dir = get_package_dir(root, kind, slug, version)
    if pkg_dir.is_dir():
        shutil.rmtree(pkg_dir)
    ref = PackageRef(kind=kind, slug=slug, version=version)
    lockfile.remove_direct_install(ref)
    lockfile.remove_package(ref.key)
    return version


# ── Download ──────────────────────────────────────────────────────────────────


def _download_package(
    client: StrawHubClient,
    kind: str,
    slug: str,
    target_version: str,
    root: Path,
    version: str | None = None,
) -> None:
    """Download a package's files into root/{kind}s/{slug}-{version}/.

    When *version* is given, it is passed to the API to request a specific
    version.  Otherwise the latest version files are fetched.
    """
    target_dir = get_package_dir(root, kind, slug, target_version)
    target_dir.mkdir(parents=True, exist_ok=True)

    # Fetch detail to get file list
    _, detail = client.get_info(slug, kind=kind, version=version)
    lv = detail.get("latestVersion", {})

    for f in lv.get("files", []):
        file_path = f["path"]
        if kind == "skill":
            content = client.get_skill_file(slug, path=file_path, version=version)
        else:
            content = client.get_role_file(slug, path=file_path, version=version)

        out_file = target_dir / file_path
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(content, encoding="utf-8")


# ── Project file install ─────────────────────────────────────────────────────


def _install_from_project_file(skip_tools=False, yes=False):
    """Install all dependencies listed in strawpot.toml."""
    pf_path = get_project_file_path()
    pf = ProjectFile.load_if_exists(pf_path)
    if pf is None:
        print_error(
            "No strawpot.toml found. "
            "Use 'strawhub install skill <slug>' or "
            "'strawhub install role <slug>'."
        )
        raise SystemExit(1)

    if pf.is_empty:
        console.print("No dependencies in strawpot.toml. Nothing to install.")
        return

    root = get_local_root()

    for dep_kind, dep_slug, constraint_str in pf.get_all_dependencies():
        existing = _slug_installed_in_scope(root, dep_kind, dep_slug)

        if existing:
            spec = parse_constraint(constraint_str)
            full_spec = DependencySpec(
                slug=dep_slug, operator=spec.operator, version=spec.version
            )
            if satisfies_version(existing, full_spec):
                console.print(
                    f"  {dep_kind} '{dep_slug}' v{existing} "
                    f"satisfies {constraint_str} [dim](skip)[/dim]"
                )
                continue
            console.print(
                f"  {dep_kind} '{dep_slug}' v{existing} "
                f"does not satisfy {constraint_str}, reinstalling..."
            )

        # Determine version arg for exact constraints
        spec = parse_constraint(constraint_str)
        version_arg = spec.version if spec.operator == "==" else None
        force_arg = bool(existing and version_arg)

        _install_impl(
            dep_slug,
            kind=dep_kind,
            is_global=False,
            skip_tools=skip_tools,
            yes=yes,
            version=version_arg,
            force=force_arg,
        )

    print_success("All dependencies from strawpot.toml installed.")
