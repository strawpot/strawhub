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
      - git-workflow>=1.0.0
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
| `metadata.strawpot.dependencies` | No | Flat list of skill slugs with optional version specifiers |
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
        - git-workflow>=1.0.0
        - code-review
        - python-testing^2.0.0
      roles:
        - reviewer
    default_model:
      provider: claude_session
      id: claude-opus-4-6
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
| `metadata.strawpot.dependencies.skills` | No | List of skill slugs with optional version specifiers |
| `metadata.strawpot.dependencies.roles` | No | List of role slugs with optional version specifiers |
| `metadata.strawpot.default_model` | No | Default model configuration (`provider` + `id`) |
| `metadata.strawpot.tools` | No | System tool requirements (same format as skills) |

Roles can depend on both skills and other roles.

## Dependency Version Specifiers

| Format | Meaning | Example |
|--------|---------|---------|
| `slug` | Latest version | `git-workflow` |
| `slug==X.Y.Z` | Exact version | `git-workflow==1.0.0` |
| `slug>=X.Y.Z` | Minimum version | `git-workflow>=1.0.0` |
| `slug^X.Y.Z` | Compatible (same major, >= specified) | `git-workflow^1.0.0` |

Versions follow semver (`major.minor.patch`). Constraints are validated at publish time — if no published version satisfies the constraint, the publish is rejected.

## System Tools

Skills and roles can declare system tool requirements under `metadata.strawpot.tools`:

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
