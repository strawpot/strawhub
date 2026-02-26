import click

from strawhub import __version__
from strawhub.commands.login import login
from strawhub.commands.whoami import whoami
from strawhub.commands.search import search
from strawhub.commands.info import info
from strawhub.commands.list import list_cmd
from strawhub.commands.install import install
from strawhub.commands.uninstall import uninstall
from strawhub.commands.resolve_cmd import resolve_cmd


@click.group()
@click.version_option(version=__version__, prog_name="strawhub")
def cli():
    """StrawHub CLI - discover and install agent skills and roles."""


cli.add_command(login)
cli.add_command(whoami)
cli.add_command(search)
cli.add_command(info)
cli.add_command(list_cmd, name="list")
cli.add_command(install)
cli.add_command(uninstall)
cli.add_command(resolve_cmd, name="resolve")
