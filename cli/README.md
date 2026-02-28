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

# Authenticate for publishing
strawhub login
```

## Commands

| Command | Description |
|---------|-------------|
| `search <query>` | Search for skills and roles |
| `info skill\|role <slug>` | Show detail for a skill or role |
| `install skill\|role <slug>` | Install with dependency resolution |
| `install-tools` | Install system tools declared by installed packages |
| `uninstall skill\|role <slug>` | Uninstall a skill or role |
| `update skill\|role <slug>` | Update an installed package |
| `update --all` | Update all installed packages |
| `publish skill\|role <path>` | Publish to the registry |
| `list` | List all available skills and roles |
| `star skill\|role <slug>` | Star / unstar a skill or role |
| `login` / `logout` / `whoami` | Authentication |

Most commands support `--json` for machine-readable output. Run `strawhub <command> --help` for details.

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
