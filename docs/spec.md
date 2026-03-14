# StrawHub Specification

## Overview

StrawHub is a web registry for StrawPot roles, skills, agents, and memories. Users discover, publish, and install reusable agent components through a web UI or REST API.

## Content Types

### Skills

A skill is a markdown instruction module that agents load into context. Skills can declare dependencies on other skills and system tool requirements.

**Files:**
- `SKILL.md` (required) — YAML frontmatter + markdown body
- Supporting files (optional) — scripts, references, examples

**Frontmatter:**
```yaml
name: code-review
description: "One-line summary"
metadata:
  strawpot:
    dependencies:
      - security-baseline
    tools:
      gh:
        description: GitHub CLI
        install:
          macos: brew install gh
          linux: apt install gh
          windows: winget install GitHub.cli
    env:
      GITHUB_TOKEN:
        required: true
        description: GitHub API token
```

### Roles

A role defines agent behavior, default agent runtime, and dependencies on skills and other roles.

**Files:**
- `ROLE.md` (required) — YAML frontmatter + markdown body (includes dependency declarations)

**Frontmatter:**
```yaml
name: implementer
description: "One-line summary"
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
```

### Agents

An agent is a wrapper binary that translates StrawPot protocol arguments into a native agent CLI command. Agents are discovered locally or published to the registry.

**Files:**
- `AGENT.md` (required) — YAML frontmatter + markdown body
- Compiled binary (required) — per-OS wrapper executable

**Frontmatter:**
```yaml
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
```

### Memories

A memory is a persistent knowledge bank that stores context, patterns, and learned information across agent sessions.

**Files:**
- `MEMORY.md` (required) — YAML frontmatter + markdown body
- Supporting files (optional) — data, indexes, binary assets

**Frontmatter:**
```yaml
name: project-context
description: "Persistent project context and conventions"
```

**File constraints:** Up to 100 files, 10 MB each, 50 MB total. Supports binary files.

## Dependencies

Dependencies are declared under `metadata.strawpot.dependencies`. Skills use a flat list of slugs (skills can only depend on other skills). Roles use a structured object with `skills` and `roles` sub-keys. The `roles` list supports `"*"` as a wildcard meaning "all available roles" — this is expanded at runtime by StrawPot and filtered out during install.

## System Tools

Skills can declare system tool requirements under `metadata.strawpot.tools`. Each tool has a `description` and an `install` block with OS-specific install commands.

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

During `strawhub install` / `strawhub update`, the CLI checks if each declared tool is on PATH and runs the install command for the current OS if missing. Users are prompted before each command unless `--yes` is passed. Use `--skip-tools` to opt out entirely.

The `strawhub install-tools` command re-runs tool checks for all installed packages — useful for re-provisioning or when tools have been removed.

## Environment Variables

Skills and agents can declare required environment variables under `metadata.strawpot.env`.

```yaml
metadata:
  strawpot:
    env:
      GITHUB_TOKEN:
        required: true
        description: GitHub API token
```

At session start, the CLI checks if each required variable is set and prompts the user interactively for missing ones. Variables set at session start are inherited by all sub-agents. During delegation, missing required variables cause the delegation to fail.

If the same variable appears in multiple skills, `required: true` takes precedence.

## Dependency Resolution

When a consumer (StrawPot CLI) installs a role:

1. Fetch role → get dependencies (skills + roles) from `metadata.strawpot.dependencies` in frontmatter
2. For each dependency, check its own dependencies for transitive deps
3. Topological sort with cycle detection
4. Return install order (leaves first)

The resolution logic exists server-side (handler in `rolesV1.ts`) but is not yet routed as an HTTP endpoint. When wired up, it will return:

```json
{
  "role": "implementer",
  "dependencies": [
    { "kind": "skill", "slug": "git-workflow", "version": "1.2.0" },
    { "kind": "skill", "slug": "code-review", "version": "2.0.0" },
    { "kind": "role", "slug": "reviewer", "version": "1.0.0" }
  ]
}
```

## Architecture

- **Frontend**: Vite + React 19 + TanStack Router + Tailwind CSS v4
- **Backend**: Convex (serverless DB + file storage + auth)
- **Auth**: GitHub OAuth via `@convex-dev/auth`
- **Search**: OpenAI embeddings + Convex vector search + lexical boosting
- **API**: HTTP actions on Convex (v1 REST endpoints)

## Web Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/skills` | Browse skills |
| `/skills/$slug` | Skill detail — file viewer with frontmatter table, version history, zip download, owner update button |
| `/roles` | Browse roles |
| `/roles/$slug` | Role detail — file viewer, version history, zip download |
| `/agents` | Browse agents |
| `/agents/$slug` | Agent detail — file viewer, version history, zip download |
| `/memories` | Browse memories |
| `/memories/$slug` | Memory detail — file viewer, version history, zip download |
| `/search` | Search skills, roles, agents, and memories |
| `/upload` | Publish — drag-and-drop files or folders, GitHub import, form auto-fill from frontmatter, update mode via `?updateSlug=` |
| `/dashboard` | My content — manage published skills, roles, agents, and memories |
| `/settings` | Profile editing, API tokens, account deletion |

### Authentication

- GitHub OAuth sign-in via `@convex-dev/auth`
- Signed-in users see an avatar + @handle dropdown in the nav with links to Dashboard, Settings, and Sign out
- Deleted accounts are soft-deleted (`deactivatedAt`); re-signing in reactivates the account

### Publishing

- **Web UI**: Drag-and-drop files or use the GitHub import (paste a URL, files are fetched via GitHub Contents API)
- SKILL.md / ROLE.md / AGENT.md / MEMORY.md frontmatter is auto-parsed to populate form fields (slug, display name)
- Slug ownership: if a slug already exists and belongs to another user, publishing is blocked
- Slug uniqueness is per-type: skills, roles, agents, and memories each have separate slug namespaces
- Version monotonicity: new versions must be strictly greater than the latest published version; auto-incremented patch if omitted
- Dependency validation errors are aggregated — all issues are reported together rather than failing on the first one
- Zip archives nest files under `{slug}-{version}/` so they extract into a named directory
- **REST API**: `POST /api/v1/skills`, `POST /api/v1/roles`, `POST /api/v1/agents`, and `POST /api/v1/memories` with bearer token auth (multipart form data)

### API Tokens

- Created and managed from Settings > API Tokens
- Token format: `sh_` prefix + 32 random hex bytes
- Raw token shown once on creation; only the SHA-256 hash is stored
- Tokens can be revoked from Settings

## Authorization

| Action | Who |
|--------|-----|
| Publish new skill/role/agent/memory | Any authenticated user |
| Update existing skill/role/agent/memory | Owner only |
| Delete (soft-delete) skill/role/agent/memory | Admin only |
| Restore skill/role/agent/memory | Admin only |
| Delete own account | Authenticated user (self) |

Users cannot delete their own published content. Only administrators can remove content from the registry.

### Admin Assignment

Admins are designated via the `ADMIN_GITHUB_LOGINS` Convex environment variable — a comma-separated list of GitHub logins (case-insensitive). The role is synced on every sign-in: users in the list get `admin`, everyone else gets `user`.

## Database Tables

- `users` — GitHub-authed users with profile (handle, displayName, bio), roles (admin/moderator/user), soft-delete support
- `skills` — skill registry entries with stats, badges, moderation status
- `skillVersions` — versioned skill bundles (files in Convex storage, optional skill dependency declarations)
- `skillEmbeddings` — vector embeddings for search
- `roles` — role registry entries (parallel to skills)
- `roleVersions` — versioned role bundles with skill/role dependency declarations
- `roleEmbeddings` — vector embeddings for search
- `agents` — agent registry entries with stats, badges, moderation status
- `agentVersions` — versioned agent bundles (files in Convex storage, supports binary files)
- `agentEmbeddings` — vector embeddings for search
- `memories` — memory registry entries with stats, badges, moderation status
- `memoryVersions` — versioned memory bundles (files in Convex storage, supports binary files)
- `memoryEmbeddings` — vector embeddings for search
- `stars` — user stars on skills/roles/agents/memories
- `comments` — user comments on skills/roles/agents/memories
- `apiTokens` — SHA-256 hashed bearer tokens for CLI/API auth
- `auditLogs` — moderation action trail
- `rateLimits` — per-IP/per-token rate limiting
