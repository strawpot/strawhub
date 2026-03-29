# StrawHub CLI

[![CI](https://img.shields.io/github/actions/workflow/status/strawpot/strawhub/ci.yml?branch=main)](https://github.com/strawpot/strawhub/actions/workflows/ci.yml?branch=main)
[![PyPI](https://img.shields.io/pypi/v/strawhub)](https://pypi.org/project/strawhub/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/strawpot/strawhub/blob/main/LICENSE)

Command-line client for [StrawHub](https://strawhub.dev), the public registry for [StrawPot](https://strawpot.com) agents.

Discover, install, publish, and manage reusable **skills**, **roles**, **agents**, **memories**, and **integrations** — with recursive dependency resolution.

## Installation

```bash
pip install strawhub
```

## Quick Start

```bash
# Search for skills, roles, agents, and memories
strawhub search "code review"

# Install a skill (dependencies resolved automatically)
strawhub install skill code-review

# Install a role
strawhub install role implementer

# Save dependencies to strawpot.toml
strawhub install skill code-review --save

# Install all dependencies from strawpot.toml
strawhub install

# Authenticate for publishing
strawhub login
```

## Project File (`strawpot.toml`)

Declare your project's skill and role dependencies in a `strawpot.toml` file at the project root:

```toml
[skills]
git-workflow = "*"
code-review = "==2.1.0"

[roles]
implementer = "*"
```

Run `strawhub install` to install everything. Teammates can clone the repo and run the same command to get an identical setup.

Version constraints: `"*"` (latest), `"==X.Y.Z"` (exact).

See the [project file documentation](../docs/project-file.md) for full details.

## Commands

### Package Management

| Command | Description |
|---------|-------------|
| `install` | Install all dependencies from `strawpot.toml` |
| `install skill\|role\|agent\|memory <slug>` | Install a specific package |
| `install skill\|role\|agent\|memory <slug> --save` | Install and save to `strawpot.toml` (`*`) |
| `install skill\|role\|agent\|memory <slug> --save-exact` | Install and save to `strawpot.toml` (`==X.Y.Z`) |
| `install skill\|role\|agent\|memory <slug> --version X.Y.Z` | Install a specific version |
| `uninstall skill\|role\|agent\|memory <slug>` | Uninstall a package |
| `uninstall skill\|role\|agent\|memory <slug> --save` | Uninstall and remove from `strawpot.toml` |
| `update skill\|role\|agent\|memory <slug>` | Update to the latest version |
| `update --all` | Update all installed packages |
| `update --all --save` | Update all and save new versions to `strawpot.toml` |
| `init` | Create `strawpot.toml` from currently installed packages |
| `install-tools` | Install system tools declared by installed packages |
| `install integration <slug>` | Install an integration (always global) |
| `uninstall integration <slug>` | Uninstall an integration |
| `update integration <slug>` | Update an integration |

### Discovery

| Command | Description |
|---------|-------------|
| `search <query>` | Search for skills, roles, agents, and memories |
| `info skill\|role\|agent\|memory <slug>` | Show detail for a skill, role, agent, or memory |
| `list` | List all available skills, roles, agents, and memories |
| `star skill\|role\|agent\|memory <slug>` | Star a skill, role, agent, or memory |
| `unstar skill\|role\|agent\|memory <slug>` | Unstar a skill, role, agent, or memory |

### Publishing

| Command | Description |
|---------|-------------|
| `publish skill\|role\|agent\|memory <path>` | Publish to the registry |

### Runtime

| Command | Description |
|---------|-------------|
| `resolve skill\|role <slug>` | Resolve and print package paths (JSON) |

### Authentication

| Command | Description |
|---------|-------------|
| `login` | Authenticate with StrawHub |
| `logout` | Remove stored credentials |
| `whoami` | Show current user info |

Most commands support `--json` for machine-readable output. See the [full CLI reference](../docs/cli.md) for detailed documentation of every command and option.

## Install Options

The `install` command supports several flags for controlling behavior:

| Option | Description |
|--------|-------------|
| `--global` | Install to global directory (`~/.strawpot`) |
| `--version X.Y.Z` | Install a specific version |
| `--force` | Force replace existing installation (requires `--version`) |
| `--update` | Update to latest if already installed |
| `--recursive` | Also update dependencies (requires `--update`) |
| `--save` | Save to `strawpot.toml` with `*` |
| `--save-exact` | Save to `strawpot.toml` with `==X.Y.Z` |
| `--skip-tools` | Skip system tool installation |
| `--yes`, `-y` | Auto-confirm tool install prompts |

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `STRAWHUB_API_URL` | Override the API endpoint | `https://strawhub.dev` |
| `STRAWHUB_TOKEN` | Override the auth token | _(from `strawhub login`)_ |
| `STRAWPOT_HOME` | Override the global install directory | `~/.strawpot` |

Settings can also be persisted in `~/.config/strawhub/config.json`.

## Links

- **Registry**: <https://strawhub.dev>
- **Source**: <https://github.com/strawpot/strawhub>
