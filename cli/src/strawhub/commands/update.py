import click

from strawhub.commands.install import _install_impl, _slug_installed_in_scope
from strawhub.display import print_success, print_error, console
from strawhub.lockfile import Lockfile
from strawhub.paths import (
    get_root,
    get_local_root,
    get_lockfile_path,
    get_project_file_path,
)
from strawhub.project_file import ProjectFile


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
@click.option(
    "--save",
    is_flag=True,
    default=False,
    help="Update version constraints in strawpot.toml to match installed versions",
)
@click.pass_context
def update(ctx, update_all, is_global, skip_tools, yes, save):
    """Update installed skills/roles to their latest versions."""
    if save and is_global:
        print_error("--save cannot be used with --global")
        raise SystemExit(1)
    if update_all:
        _update_all_impl(is_global, skip_tools=skip_tools, yes=yes, save=save)
        return
    if ctx.invoked_subcommand is None:
        click.echo("Specify 'skill <slug>', 'role <slug>', or use --all.")
        ctx.exit(1)


def _save_updated_version(kind: str, slug: str) -> None:
    """Update strawpot.toml constraint for a package to its current installed version."""
    pf = ProjectFile.load(get_project_file_path())
    if not pf.has_dependency(kind, slug):
        return
    version = _slug_installed_in_scope(get_local_root(), kind, slug)
    if version and pf.update_dependency(kind, slug, version):
        pf.save()
        constraint = pf.get_constraint(kind, slug)
        console.print(f"Updated '{slug}' to {constraint} in strawpot.toml")


def _update_all_impl(is_global, skip_tools=False, yes=False, save=False):
    root = get_root(is_global)
    lockfile = Lockfile.load(get_lockfile_path(root))

    if not lockfile.direct_installs:
        print_error("No packages installed.")
        raise SystemExit(1)

    for ref in list(lockfile.direct_installs):
        _install_impl(
            ref.slug,
            kind=ref.kind,
            is_global=is_global,
            skip_tools=skip_tools,
            yes=yes,
            update=True,
        )
        if save:
            _save_updated_version(ref.kind, ref.slug)


def _update_one_impl(slug, kind, is_global, skip_tools=False, yes=False, save=False):
    if save and is_global:
        print_error("--save cannot be used with --global")
        raise SystemExit(1)
    _install_impl(
        slug,
        kind=kind,
        is_global=is_global,
        skip_tools=skip_tools,
        yes=yes,
        update=True,
    )
    if save:
        _save_updated_version(kind, slug)


@update.command("skill")
@click.argument("slug")
@click.option("--global", "is_global", is_flag=True, default=False, help="Update global packages (~/.strawpot or STRAWPOT_HOME)")
@click.option("--skip-tools", is_flag=True, default=False, help="Skip running system tool install commands")
@click.option("--yes", "-y", is_flag=True, default=False, help="Automatically confirm tool install commands without prompting")
@click.option("--save", is_flag=True, default=False, help="Update version constraint in strawpot.toml")
def update_skill(slug, is_global, skip_tools, yes, save):
    """Update an installed skill to its latest version."""
    _update_one_impl(slug, kind="skill", is_global=is_global, skip_tools=skip_tools, yes=yes, save=save)


@update.command("role")
@click.argument("slug")
@click.option("--global", "is_global", is_flag=True, default=False, help="Update global packages (~/.strawpot or STRAWPOT_HOME)")
@click.option("--skip-tools", is_flag=True, default=False, help="Skip running system tool install commands")
@click.option("--yes", "-y", is_flag=True, default=False, help="Automatically confirm tool install commands without prompting")
@click.option("--save", is_flag=True, default=False, help="Update version constraint in strawpot.toml")
def update_role(slug, is_global, skip_tools, yes, save):
    """Update an installed role to its latest version."""
    _update_one_impl(slug, kind="role", is_global=is_global, skip_tools=skip_tools, yes=yes, save=save)
