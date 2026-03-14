# Content Format

StrawHub hosts four content types: **skills**, **roles**, **agents**, and **memories**. All use markdown files with YAML frontmatter. Agents and memories also support binary files.

## Skills

A skill is a folder containing:

- **Required:** `SKILL.md` — YAML frontmatter + markdown body
- **Optional:** supporting text files (scripts, references, examples)

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

### Skill frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Package slug (lowercase, URL-safe) |
| `description` | Yes | One-line summary shown in search results |
| `version` | No | Semver version (auto-incremented if omitted) |
| `metadata.strawpot.dependencies` | No | Flat list of skill slugs |
| `metadata.strawpot.env` | No | Required environment variables |
| `metadata.strawpot.tools` | No | System tool requirements with OS-specific install commands |

Skills can only depend on other skills.

## Roles

A role is a single file:

- **Required:** `ROLE.md` — YAML frontmatter + markdown body

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
    default_agent: strawpot-claude-code
---

# Implementer

Role instructions for the agent...
```

### Role frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Package slug (lowercase, URL-safe) |
| `description` | Yes | One-line summary |
| `version` | No | Semver version (auto-incremented if omitted) |
| `metadata.strawpot.dependencies.skills` | No | List of skill slugs |
| `metadata.strawpot.dependencies.roles` | No | List of role slugs (use `"*"` for all available roles) |
| `metadata.strawpot.default_agent` | No | Default agent runtime name |

Roles can depend on both skills and other roles.

## Agents

An agent is a CLI runtime wrapper that bridges StrawPot to a specific AI platform:

- **Required:** `AGENT.md` — YAML frontmatter + markdown body
- **Optional:** compiled binaries and supporting files

### AGENT.md

```yaml
---
name: claude-code
description: "Claude Code agent"
metadata:
  version: "0.1.0"
  strawpot:
    bin:
      macos: strawpot_claude_code
      linux: strawpot_claude_code
    tools:
      claude:
        description: Claude Code CLI
        install:
          macos: npm install -g @anthropic-ai/claude-code
          linux: npm install -g @anthropic-ai/claude-code
    params:
      model:
        type: string
        default: claude-sonnet-4-6
        description: Model to use
    env:
      ANTHROPIC_API_KEY:
        required: false
        description: Anthropic API key
---

# Claude Code

Agent instructions...
```

### Agent frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Package slug (lowercase, URL-safe) |
| `description` | Yes | One-line summary |
| `version` | No | Semver version (auto-incremented if omitted) |
| `metadata.strawpot.bin` | No | OS-specific binary names |
| `metadata.strawpot.tools` | No | System tool requirements |
| `metadata.strawpot.params` | No | Configurable parameters |
| `metadata.strawpot.env` | No | Required environment variables |

### Agent file constraints

- Up to 100 files, 10 MB each, 50 MB total
- Supports binary files (compiled executables)

## Memories

A memory is a persistent knowledge bank that stores context and patterns across agent sessions:

- **Required:** `MEMORY.md` — YAML frontmatter + markdown body
- **Optional:** supporting files (data, indexes, binary assets)

### MEMORY.md

```yaml
---
name: project-context
description: "Persistent project context and conventions"
---

# Project Context

Memory contents for the agent...
```

### Memory frontmatter fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Package slug (lowercase, URL-safe) |
| `description` | Yes | One-line summary |
| `version` | No | Semver version (auto-incremented if omitted) |

### Memory file constraints

- Up to 100 files, 10 MB each, 50 MB total
- Supports binary files

## System Tools

Skills can declare system tool requirements under `metadata.strawpot.tools`:

```yaml
metadata:
  strawpot:
    tools:
      gh:
        description: GitHub CLI
        install:
          macos: brew install gh
          linux: apt install gh
          windows: winget install GitHub.cli
      docker:
        description: Docker
        install:
          macos: brew install docker
          linux: apt install docker.io
          windows: winget install Docker.DockerDesktop
```

Supported OS keys: `macos`, `linux`, `windows`.

During `strawhub install` / `strawhub update`, the CLI checks if each declared tool is on PATH and runs the install command for the current OS if missing. Users are prompted before each command unless `--yes` is passed.

## File Constraints

### Skills and Roles
- Up to 100 files per package, 512 KB each
- Allowed extensions: `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`
- Roles must contain exactly one file named `ROLE.md`

### Agents and Memories
- Up to 100 files per package, 10 MB each, 50 MB total
- Supports binary files (compiled executables, data files)

## Naming

Slugs must be lowercase and URL-safe. Slug uniqueness is per-type — skills, roles, agents, and memories each have separate namespaces.
