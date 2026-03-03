# Content Format

StrawHub hosts two content types: **skills** and **roles**. Both are markdown files with YAML frontmatter.

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
    default_agent: claude_code
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
| `metadata.strawpot.dependencies.roles` | No | List of role slugs |
| `metadata.strawpot.default_agent` | No | Default agent runtime name |

Roles can depend on both skills and other roles.

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

- Up to 20 files per package, 512 KB each
- Allowed extensions: `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`
- Roles must contain exactly one file named `ROLE.md`

## Naming

Slugs must be lowercase and URL-safe. Slug uniqueness is per-type — skills and roles have separate namespaces.
