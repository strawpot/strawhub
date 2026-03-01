"""System tool dependency management for installed packages.

Reads metadata.strawpot.tools from SKILL.md / ROLE.md frontmatter and
installs missing tools via OS-specific commands.

Example frontmatter:
    metadata:
      strawpot:
        tools:
          gh:
            description: GitHub CLI
            install:
              macos: brew install gh
              linux: apt install gh
              windows: winget install GitHub.cli
"""

import platform
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import click

from strawhub.display import console, print_error
from strawhub.frontmatter import parse_frontmatter
from strawhub.paths import get_package_dir


OS_MAP = {
    "Darwin": "macos",
    "Linux": "linux",
    "Windows": "windows",
}


@dataclass
class ToolSpec:
    """A single tool install specification."""

    name: str
    description: str
    command: str | None  # OS-specific install command, or None if no match


def detect_os() -> str | None:
    """Return normalized OS name: 'macos', 'linux', 'windows', or None."""
    return OS_MAP.get(platform.system())


def extract_tools(fm: dict) -> dict | None:
    """Extract tools dict from parsed frontmatter.

    Reads from metadata.strawpot.tools.
    Returns the tools dict or None if not present.
    """
    tools = (
        fm.get("metadata", {})
        .get("strawpot", {})
        .get("tools")
    )
    if not isinstance(tools, dict) or not tools:
        return None
    return tools


def parse_tool_specs(tools_dict: dict, current_os: str) -> list[ToolSpec]:
    """Convert a tools dict into a list of ToolSpec for the current OS."""
    specs = []
    for name, config in tools_dict.items():
        if not isinstance(config, dict):
            continue
        description = config.get("description", "")
        install_block = config.get("install", {})
        command = install_block.get(current_os) if isinstance(install_block, dict) else None
        specs.append(ToolSpec(name=name, description=description, command=command))
    return specs


def check_tool_installed(tool_name: str) -> bool:
    """Check if a tool is available on PATH."""
    return shutil.which(tool_name) is not None


def run_tool_installs(
    tools_dict: dict,
    yes: bool = False,
    seen: set[str] | None = None,
) -> list[dict]:
    """Run install commands for missing tools.

    Returns a list of result dicts with keys: tool, status, command.
    Status is one of: installed, skipped, failed, declined, no_command.
    """
    current_os = detect_os()
    if current_os is None:
        console.print(
            "[yellow]Warning:[/yellow] Could not detect OS, "
            "skipping tool installs."
        )
        return []

    specs = parse_tool_specs(tools_dict, current_os)
    results: list[dict] = []

    for spec in specs:
        if seen is not None and spec.name in seen:
            continue
        if seen is not None:
            seen.add(spec.name)

        if spec.command is None:
            results.append({"tool": spec.name, "status": "no_command", "command": None})
            continue

        if check_tool_installed(spec.name):
            console.print(f"  '{spec.name}' already installed, skipping.")
            results.append({"tool": spec.name, "status": "skipped", "command": spec.command})
            continue

        desc = f" ({spec.description})" if spec.description else ""
        if not yes:
            confirmed = click.confirm(
                f"  Install '{spec.name}'{desc}? Command: {spec.command}",
                default=True,
            )
            if not confirmed:
                results.append({"tool": spec.name, "status": "declined", "command": spec.command})
                continue

        console.print(f"  Running: {spec.command}")
        try:
            proc = subprocess.run(spec.command, shell=True)  # noqa: S602
            if proc.returncode == 0:
                console.print(f"  [green]Installed '{spec.name}'[/green]")
                results.append({"tool": spec.name, "status": "installed", "command": spec.command})
            else:
                print_error(
                    f"Failed to install '{spec.name}' (exit code {proc.returncode}). "
                    "You may need to install it manually."
                )
                results.append({"tool": spec.name, "status": "failed", "command": spec.command})
        except OSError as e:
            print_error(f"Failed to run '{spec.command}': {e}")
            results.append({"tool": spec.name, "status": "failed", "command": spec.command})

    return results


def run_tool_installs_for_package(
    root: Path,
    kind: str,
    slug: str,
    version: str,
    yes: bool = False,
    seen: set[str] | None = None,
) -> list[dict]:
    """Extract tools from a downloaded package and run installs."""
    pkg_dir = get_package_dir(root, kind, slug, version)
    main_file = "SKILL.md" if kind == "skill" else "ROLE.md"
    md_path = pkg_dir / main_file

    if not md_path.is_file():
        return []

    parsed = parse_frontmatter(md_path.read_text(encoding="utf-8"))
    tools = extract_tools(parsed["frontmatter"])
    if not tools:
        return []

    console.print(f"  Checking tools for {kind} '{slug}'...")
    return run_tool_installs(tools, yes=yes, seen=seen)


def run_tool_installs_for_all(
    root: Path,
    lockfile,
    yes: bool = False,
) -> list[dict]:
    """Run tool installs for all packages in a lockfile."""
    seen: set[str] = set()
    all_results: list[dict] = []

    for key, pkg in lockfile.packages.items():
        results = run_tool_installs_for_package(
            root,
            pkg["kind"],
            pkg["slug"],
            pkg["version"],
            yes=yes,
            seen=seen,
        )
        all_results.extend(results)

    return all_results
