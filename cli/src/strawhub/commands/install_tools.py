import click

from strawhub.display import print_success, print_error, console
from strawhub.lockfile import Lockfile
from strawhub.paths import get_root, get_lockfile_path
from strawhub.tools import run_tool_installs_for_all


@click.command("install-tools")
@click.option(
    "--global",
    "is_global",
    is_flag=True,
    default=False,
    help="Scan global packages (~/.strawpot or STRAWPOT_HOME)",
)
@click.option(
    "--yes",
    "-y",
    is_flag=True,
    default=False,
    help="Automatically confirm install commands without prompting",
)
def install_tools(is_global, yes):
    """Install system tools declared by installed packages.

    Scans all installed skills/roles for metadata.strawpot.tools
    and runs install commands for any missing tools.
    """
    root = get_root(is_global)
    lockfile = Lockfile.load(get_lockfile_path(root))

    if not lockfile.packages:
        print_error("No packages installed.")
        raise SystemExit(1)

    results = run_tool_installs_for_all(root, lockfile, yes=yes)

    failed = [r for r in results if r["status"] == "failed"]
    if failed:
        names = ", ".join(r["tool"] for r in failed)
        console.print(
            f"\n[yellow]Note:[/yellow] Some tools failed to install: {names}. "
            "Run 'strawhub install-tools' to retry."
        )
    else:
        print_success("Tool check complete.")
