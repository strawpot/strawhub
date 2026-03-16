# StrawHub

npm for AI agents.

Browse, install, and publish the roles, skills, agents, memories, and integrations that power your AI workforce — **[strawhub.dev](https://strawhub.dev)**

<p align="center">
  <a href="https://github.com/strawpot/strawhub/actions/workflows/ci.yml?branch=main"><img src="https://img.shields.io/github/actions/workflow/status/strawpot/strawhub/ci.yml?branch=main&style=for-the-badge" alt="CI"></a>
  <a href="https://discord.gg/2BRsCRUrKb"><img src="https://img.shields.io/discord/1476285531464929505?label=Discord&logo=discord&logoColor=white&color=5865F2&style=for-the-badge" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

```
strawhub install role ai-ceo

  Resolving dependencies...

  ✓ role   ai-ceo
  ✓ role   pm
  ✓ skill  project-planning
  ✓ skill  task-breakdown
  ✓ role   implementer
  ✓ skill  git-workflow
  ✓ skill  python-dev
  ✓ skill  run-tests
  ✓ skill  code-review
  ✓ role   reviewer
  ✓ skill  security-baseline

  11 packages installed.
```

One command. Your entire AI company — skills, roles, and all their dependencies — ready to work.

## The Problem

AI agents are powerful. But every team reinvents the wheel:

- Write the same "code review" prompt for the tenth time
- Copy-paste skills between projects
- No way to share what works

**StrawHub is a package registry for AI agent capabilities.** Publish once, install anywhere.

## Quick Start

```bash
pip install strawpot

strawhub install role ai-ceo
strawpot gui
```

That's it. StrawHub resolves every skill and sub-role your AI CEO needs. StrawPot runs them.

## What's Inside

```
┌──────────────────────────────────────────────────────┐
│                       StrawHub                       │
│                                                      │
│   ┌─── Core ──────────────────────────────────────┐  │
│   │  Roles            Skills                      │  │
│   │  ┌──────────┐    ┌──────────┐                 │  │
│   │  │ai-ceo    │    │git-wflow │                 │  │
│   │  │pm        │    │code-rev  │                 │  │
│   │  │implmtr   │    │py-test   │                 │  │
│   │  │reviewer  │    │debugging │                 │  │
│   │  └──────────┘    └──────────┘                 │  │
│   └───────────────────────────────────────────────┘  │
│                                                      │
│   ┌─── Extensions ────────────────────────────────┐  │
│   │  Agents          Memories      Integrations   │  │
│   │  ┌──────────┐   ┌──────────┐  ┌──────────┐    │  │
│   │  │claude    │   │proj-ctx  │  │telegram  │    │  │
│   │  │codex     │   │patterns  │  │slack     │    │  │
│   │  │gemini    │   │decisions │  │discord   │    │  │
│   │  └──────────┘   └──────────┘  └──────────┘    │  │
│   └───────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Roles — what agents are
Job definitions that bundle skills. An `ai-ceo` depends on `pm`, `implementer`, and `reviewer` — StrawPot handles the delegation.

### Skills — what agents can do
Atomic capabilities: writing code, reviewing PRs, running tests, searching docs. Roles compose skills; skills are the building blocks.

### Agents — where agents run
Runtime wrappers for Claude Code, Codex, Gemini, or your own CLI.

### Memories — what agents remember
Persistent knowledge banks: project context, code patterns, past decisions.

### Integrations — how agents connect
Adapters that bridge StrawPot to external services like Telegram, Slack, or Discord.

## Everything Is a Markdown File

```yaml
# ai-ceo/ROLE.md
---
name: ai-ceo
description: "Orchestrator that analyzes tasks, discovers all installed roles,
  and delegates to the best-fit role."
metadata:
  strawpot:
    dependencies:
      roles:
        - "*"
    default_agent: strawpot-claude-code
---

# AI CEO

You are a routing layer with judgment. The user brings you a task —
you figure out which role on your team should handle it, write a clear
task description, and delegate. That's the entire job.
```

No Python. No YAML config files. No orchestration code. **One Markdown file per role.**

## How It Compares

```
# CrewAI:    40 lines of Python to define a 2-agent team
# OpenClaw:  Skills in Markdown, but no roles or dependency resolution
# StrawPot:  One ROLE.md file. Done.
```

| | CrewAI | OpenClaw | StrawPot + StrawHub |
|---|---|---|---|
| **Format** | YAML + Python | JSON5 + Markdown | Markdown only |
| **Skills / Tools** | Python (tools) | Markdown (skills) | Markdown (skills) |
| **Roles** | Agent attribute | — | Standalone Markdown |
| **Memory** | Python config | Markdown/YAML (local) | Markdown (installable) |
| **Skill dependency resolution** | — | — | Automatic |
| **Multi-agent delegation** | Python config | Runtime (subagent spawn) | Declarative (role deps) |
| **Package registry** | — | — | **StrawHub** |

## Automatic Dependency Resolution

Install a role. Everything it needs comes with it.

```
strawhub install role ai-ceo

  ai-ceo
  ├─ role: pm
  │   ├─ skill: project-planning
  │   └─ skill: task-breakdown
  ├─ role: implementer
  │   ├─ skill: git-workflow
  │   ├─ skill: python-dev
  │   ├─ skill: run-tests
  │   └─ skill: code-review
  └─ role: reviewer
      ├─ skill: code-review       (already installed)
      └─ skill: security-baseline
```

Skills use client-side DFS. Roles use server-side topological sort with cycle detection. You don't have to think about any of it.

## CLI

```bash
# Install
strawhub install role ai-ceo
strawhub install skill git-workflow
strawhub install agent strawpot-claude-code
strawhub install memory project-context
strawhub install integration telegram

# Discover
strawhub search "code review"
strawhub info role ai-ceo
strawhub list

# Validate & Publish
strawhub validate skill ./my-skill/
strawhub publish role ./my-role/
strawhub publish skill ./my-skill/

# Manage
strawhub login
strawhub whoami
```

## Ecosystem

| Project | What it does |
|---------|-------------|
| [**StrawPot**](https://strawpot.com) | Runtime — runs role-based AI agents locally |
| [**StrawHub**](https://strawhub.dev) | Registry — distributes roles, skills, agents, memories, and integrations |
| [**Denden**](https://github.com/strawpot/denden) | Transport — gRPC bridge between agents and the orchestrator |

```
User task → StrawPot runtime → Role (ai-ceo)
                                 ├─ Sub-role (pm)
                                 │   └─ Skills (project-planning, task-breakdown)
                                 ├─ Sub-role (implementer)
                                 │   ├─ Skills (git-workflow, python-dev)
                                 │   └─ Agent (strawpot-claude-code)
                                 └─ Sub-role (reviewer)
                                     ├─ Skills (code-review, security-baseline)
                                     └─ Agent (gemini)
```

## Documentation

- [CLI Reference](docs/cli.md)
- [HTTP API](docs/http-api.md)
- [Content Format](docs/content-format.md)
- [Architecture](docs/architecture.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE)

---

<p align="center">
Great engineers shouldn't re-invent agent skills.<br>
They should install them.<br>
<strong><a href="https://strawhub.dev">strawhub.dev</a></strong>
</p>
