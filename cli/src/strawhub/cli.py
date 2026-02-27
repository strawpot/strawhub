import click

from strawhub import __version__
from strawhub.commands.login import login
from strawhub.commands.logout import logout
from strawhub.commands.whoami import whoami
from strawhub.commands.search import search
from strawhub.commands.info import info
from strawhub.commands.list import list_cmd
from strawhub.commands.install import install
from strawhub.commands.uninstall import uninstall
from strawhub.commands.update import update
from strawhub.commands.publish import publish
from strawhub.commands.resolve_cmd import resolve_cmd
from strawhub.commands.star import star, unstar
from strawhub.commands.delete import delete
from strawhub.commands.ban_user import ban_user
from strawhub.commands.set_role import set_role
from strawhub.commands.install_tools import install_tools


@click.group()
@click.version_option(version=__version__, prog_name="strawhub")
def cli():
    """StrawHub CLI - discover and install agent skills and roles."""


cli.add_command(login)
cli.add_command(logout)
cli.add_command(whoami)
cli.add_command(search)
cli.add_command(info)
cli.add_command(list_cmd, name="list")
cli.add_command(install)
cli.add_command(install_tools, name="install-tools")
cli.add_command(uninstall)
cli.add_command(update)
cli.add_command(publish)
cli.add_command(resolve_cmd, name="resolve")
cli.add_command(star)
cli.add_command(unstar)
cli.add_command(delete)
cli.add_command(ban_user)
cli.add_command(set_role)
