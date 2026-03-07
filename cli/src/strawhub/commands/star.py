import click

from strawhub.client import StrawHubClient
from strawhub.display import print_success, print_error
from strawhub.errors import NotFoundError, StrawHubError


@click.group(invoke_without_command=True)
@click.pass_context
def star(ctx):
    """Star a skill, role, agent, or memory."""
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


def _star_impl(slug, kind):
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            result = client.toggle_star(slug, kind)
            if result.get("starred"):
                print_success(f"Starred {kind} '{slug}'")
            else:
                # Was already starred (toggle removed it), toggle again
                client.toggle_star(slug, kind)
                print_success(f"Starred {kind} '{slug}'")
        except NotFoundError:
            print_error(f"'{slug}' not found.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)


@star.command("skill")
@click.argument("slug")
def star_skill(slug):
    """Star a skill."""
    _star_impl(slug, kind="skill")


@star.command("role")
@click.argument("slug")
def star_role(slug):
    """Star a role."""
    _star_impl(slug, kind="role")


@star.command("agent")
@click.argument("slug")
def star_agent(slug):
    """Star an agent."""
    _star_impl(slug, kind="agent")


@star.command("memory")
@click.argument("slug")
def star_memory(slug):
    """Star a memory."""
    _star_impl(slug, kind="memory")


@click.group(invoke_without_command=True)
@click.pass_context
def unstar(ctx):
    """Remove star from a skill, role, agent, or memory."""
    if ctx.invoked_subcommand is None:
        click.echo(ctx.get_help())
        ctx.exit(1)


def _unstar_impl(slug, kind):
    with StrawHubClient() as client:
        if not client.token:
            print_error("Not logged in. Run 'strawhub login' first.")
            raise SystemExit(1)
        try:
            result = client.toggle_star(slug, kind)
            if not result.get("starred"):
                print_success(f"Unstarred {kind} '{slug}'")
            else:
                # Was not starred (toggle added it), toggle again
                client.toggle_star(slug, kind)
                print_success(f"Unstarred {kind} '{slug}'")
        except NotFoundError:
            print_error(f"'{slug}' not found.")
            raise SystemExit(1)
        except StrawHubError as e:
            print_error(str(e))
            raise SystemExit(1)


@unstar.command("skill")
@click.argument("slug")
def unstar_skill(slug):
    """Remove star from a skill."""
    _unstar_impl(slug, kind="skill")


@unstar.command("role")
@click.argument("slug")
def unstar_role(slug):
    """Remove star from a role."""
    _unstar_impl(slug, kind="role")


@unstar.command("agent")
@click.argument("slug")
def unstar_agent(slug):
    """Remove star from an agent."""
    _unstar_impl(slug, kind="agent")


@unstar.command("memory")
@click.argument("slug")
def unstar_memory(slug):
    """Remove star from a memory."""
    _unstar_impl(slug, kind="memory")
