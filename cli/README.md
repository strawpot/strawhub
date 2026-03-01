# StrawHub CLI

[![CI](https://img.shields.io/github/actions/workflow/status/strawpot/strawhub/ci.yml?branch=main)](https://github.com/strawpot/strawhub/actions/workflows/ci.yml?branch=main)
[![PyPI](https://img.shields.io/pypi/v/strawhub)](https://pypi.org/project/strawhub/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/strawpot/strawhub/blob/main/LICENSE)

Command-line client for [StrawHub](https://strawhub.dev), the public role and skill registry for [StrawPot](https://strawpot.com) agents.

Discover, install, publish, and manage reusable **skills** and **roles** — with recursive dependency resolution.

## Installation

```bash
pip install strawhub
```

## Quick Start

```bash
# Search for skills and roles
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
git-workflow = "^1.0.0"
code-review = "==2.1.0"

[roles]
implementer = "^1.0.0"
```

Run `strawhub install` to install everything. Teammates can clone the repo and run the same command to get an identical setup.

Version constraints: `"*"` (latest), `"^X.Y.Z"` (compatible), `"==X.Y.Z"` (exact), `">=X.Y.Z"` (minimum).

See the [project file documentation](../docs/project-file.md) for full details.

## Commands

### Package Management

| Command | Description |
|---------|-------------|
| `install` | Install all dependencies from `strawpot.toml` |
| `install skill\|role <slug>` | Install a specific skill or role |
| `install skill\|role <slug> --save` | Install and save to `strawpot.toml` (`^X.Y.Z`) |
| `install skill\|role <slug> --save-exact` | Install and save to `strawpot.toml` (`==X.Y.Z`) |
| `install skill\|role <slug> --version X.Y.Z` | Install a specific version |
| `uninstall skill\|role <slug>` | Uninstall a skill or role |
| `uninstall skill\|role <slug> --save` | Uninstall and remove from `strawpot.toml` |
| `update skill\|role <slug>` | Update to the latest version |
| `update --all` | Update all installed packages |
| `update --all --save` | Update all and save new versions to `strawpot.toml` |
| `init` | Create `strawpot.toml` from currently installed packages |
| `install-tools` | Install system tools declared by installed packages |

### Discovery

| Command | Description |
|---------|-------------|
| `search <query>` | Search for skills and roles |
| `info skill\|role <slug>` | Show detail for a skill or role |
| `list` | List all available skills and roles |
| `star skill\|role <slug>` | Star a skill or role |
| `unstar skill\|role <slug>` | Unstar a skill or role |

### Publishing

| Command | Description |
|---------|-------------|
| `publish skill\|role <path>` | Publish to the registry |

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
| `--save` | Save to `strawpot.toml` with `^X.Y.Z` |
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
- **Discord**: <https://discord.gg/buEbvEMC>
