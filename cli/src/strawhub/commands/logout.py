import click

from strawhub.config import load_config, save_config
from strawhub.display import print_success, print_error


@click.command()
def logout():
    """Log out by removing the stored API token."""
    config = load_config()
    if "token" not in config:
        print_error("Not logged in.")
        raise SystemExit(1)
    del config["token"]
    save_config(config)
    print_success("Logged out successfully.")
