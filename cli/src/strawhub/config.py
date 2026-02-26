import json
import os
from pathlib import Path

from platformdirs import user_config_dir

CONFIG_DIR = Path(user_config_dir("strawhub"))
CONFIG_FILE = CONFIG_DIR / "config.json"
DEFAULT_API_URL = "https://strawhub.dev"


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        return {}
    return json.loads(CONFIG_FILE.read_text())


def save_config(config: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2) + "\n")


def get_token() -> str | None:
    return os.environ.get("STRAWHUB_TOKEN") or load_config().get("token")


def set_token(token: str) -> None:
    config = load_config()
    config["token"] = token
    save_config(config)


def get_api_url() -> str:
    env_url = os.environ.get("STRAWHUB_API_URL")
    if env_url:
        return env_url.rstrip("/")
    return load_config().get("api_url", DEFAULT_API_URL).rstrip("/")
