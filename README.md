# StrawHub

<p align="center">
  <a href="https://github.com/strawpot/strawhub/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/strawpot/strawhub/ci.yml?branch=main&style=for-the-badge" alt="CI"></a>
  <a href="https://discord.gg/buEbvEMC"><img src="https://img.shields.io/discord/1476285531464929505?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

StrawHub is the registry for [StrawPot](https://strawpot.com) — the open-source framework for role-based AI agents.

Discover, publish, and install **roles**, **skills**, **agents**, and **memories** that power StrawPot.

```
# CrewAI: 40 lines of Python to define a 2-agent team
# OpenClaw: Skills in Markdown, but no roles or dependency resolution
# StrawPot: One ROLE.md file. Done.
```

| | CrewAI | OpenClaw | StrawPot |
|---|---|---|---|
| **Format** | YAML + Python | JSON5 + Markdown | Markdown only |
| **Skills / Tools** | Python (tools) | Markdown (skills) | Markdown (skills) |
| **Roles** | Agent attribute | — | Standalone Markdown |
| **Skill dependency resolution** | — | — | Automatic |
| **Multi-agent delegation** | Python config | Runtime (subagent spawn) | Declarative (role deps) |

## Why StrawPot?

Define your AI team in Markdown. No Python. No orchestration code. Push a ROLE.md, install it, and your agents know what to do.

- **Zero boilerplate** — A role is a Markdown file with YAML frontmatter. That's it.
- **Automatic dependency resolution** — Install a role and every skill it needs comes with it.
- **Declarative delegation** — A team-lead role depends on other roles. StrawPot handles the orchestration.
- **Agent-agnostic** — Same role works with Claude Code, Codex, Gemini, or your own runtime.

## Quick Start

```bash
pip install strawpot        # the runtime
pip install strawhub        # the registry CLI
strawhub install role implementer
```

StrawHub resolves all required skills automatically.

## StrawPot Ecosystem

| Project | Role |
|---------|------|
| [**StrawPot**](https://strawpot.com) | Runtime — runs role-based AI agents locally |
| [**StrawHub**](https://strawhub.dev) | Registry — distributes roles, skills, and agents |
| [**Denden**](https://github.com/strawpot/denden) | Transport — gRPC bridge between agents and the orchestrator |

```
 User task → StrawPot runtime → Role (team-lead)
                                  ├─ Sub-role (implementer)
                                  │   ├─ Skills (git-workflow, python-dev)
                                  │   └─ Agent (claude_code)
                                  └─ Sub-role (reviewer)
                                      ├─ Skills (code-review, security-baseline)
                                      └─ Agent (claude_code)
```

## Concepts

Skills are abilities. Roles are jobs. A team-lead role delegates to other roles as sub-agents.

### Skill
Atomic capabilities such as writing code, searching documents, or running tests.

Examples: `git-workflow` · `code-review` · `debugging` · `web-search`

### Role
Job definitions that bundle the skills needed for the work. A role like `team-lead` can depend on other roles and delegate tasks to them as sub-agents.

Examples: `implementer` · `reviewer` · `analyst` · `team-lead`

### Agent
CLI runtimes that execute roles. Each agent bridges StrawPot to a specific AI platform like Claude Code, ChatGPT, or Gemini.

Examples: `claude_code` · `codex` · `gemini`

### Memory
Persistent memory banks that store knowledge, context, and learned patterns across agent sessions.

Examples: `project-context` · `code-patterns` · `team-decisions`

### Dependencies
Roles and skills declare dependencies under `metadata.strawpot.dependencies`. A role can depend on skills (capabilities it needs) and other roles (sub-agents it delegates to). Dependencies are resolved automatically on install.

## Content Formats

### ROLE.md

```yaml
---
name: implementer
description: "Writes code to implement features and fix bugs"
metadata:
  strawpot:
    dependencies:
      skills:
        - git-workflow
        - code-review
        - python-testing
      roles:
        - reviewer
    default_agent: claude_code
---

# Implementer

Role instructions for the agent...
```

### SKILL.md

```yaml
---
name: code-review
description: "Code review checklist and structured review output"
metadata:
  strawpot:
    dependencies:
      - security-baseline
      - git-workflow
    tools:
      gh:
        description: GitHub CLI
        install:
          macos: brew install gh
          linux: apt install gh
          windows: winget install GitHub.cli
---

# Code Review

Instructions for the agent...
```

## Roadmap

- [x] Skills registry
- [x] Roles registry
- [x] Agents registry
- [x] Memories registry

## Documentation

- [CLI Reference](docs/cli.md)
- [HTTP API](docs/http-api.md)
- [Content Format](docs/content-format.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE)
