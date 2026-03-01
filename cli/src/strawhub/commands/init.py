"""Initialize strawpot.toml from currently installed local packages."""

import click

from strawhub.display import print_success, print_error, console
from strawhub.lockfile import Lockfile
from strawhub.paths import get_local_root, get_lockfile_path, get_project_file_path
from strawhub.project_file import ProjectFile


@click.command()
@click.option(
    "--force",
    is_flag=True,
    default=False,
    help="Overwrite existing strawpot.toml",
)
@click.option(
    "--exact",
    is_flag=True,
    default=False,
    help="Use ==X.Y.Z constraints instead of ^X.Y.Z",
)
def init(force, exact):
    """Create strawpot.toml from currently installed local packages."""
    pf_path = get_project_file_path()

    if pf_path.exists() and not force:
        print_error(
            "strawpot.toml already exists. Use --force to overwrite."
        )
        raise SystemExit(1)

    root = get_local_root()
    lockfile = Lockfile.load(get_lockfile_path(root))

    if not lockfile.direct_installs:
        print_error(
            "No local packages installed. "
            "Install packages first with 'strawhub install'."
        )
        raise SystemExit(1)

    pf = ProjectFile(pf_path)
    for ref in lockfile.direct_installs:
        pf.add_dependency(ref.kind, ref.slug, ref.version, exact=exact)

    pf.save()

    count = len(lockfile.direct_installs)
    console.print(f"Wrote {count} package(s) to strawpot.toml")
    for ref in sorted(lockfile.direct_installs, key=lambda r: (r.kind, r.slug)):
        constraint = f"=={ref.version}" if exact else f"^{ref.version}"
        console.print(f"  {ref.kind} '{ref.slug}' {constraint}")

    print_success("strawpot.toml created.")
