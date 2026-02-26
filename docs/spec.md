# StrawHub Specification

## Overview

StrawHub is a web registry for StrawPot roles and skills. Users discover, publish, and install reusable agent components through a web UI or REST API.

## Content Types

### Skills

A skill is a markdown instruction module that agents load into context. Skills can declare dependencies on other skills.

**Files:**
- `SKILL.md` (required) — YAML frontmatter + markdown body
- Supporting files (optional) — scripts, references, examples

**Frontmatter:**
```yaml
name: code-review
description: "One-line summary"
dependencies:
  - security-baseline
```

### Roles

A role defines agent behavior, model configuration, and dependencies on skills and other roles.

**Files:**
- `ROLE.md` (required) — YAML frontmatter + markdown body (includes dependency declarations)

**Frontmatter:**
```yaml
name: implementer
description: "One-line summary"
dependencies:
  skills:
    - git-workflow>=1.0.0
    - code-review
    - python-testing^2.0.0
  roles:
    - reviewer
metadata:
  strawpot:
    default_model:
      provider: claude_session
      id: claude-opus-4-6
```

## Dependency Version Specifiers

Skills use a flat `dependencies` list (skills can only depend on other skills). Roles use a structured `dependencies` object with `skills` and `roles` sub-keys.

| Format | Meaning | Example |
|--------|---------|---------|
| `slug` | Latest version | `git-workflow` |
| `slug==X.Y.Z` | Exact version | `git-workflow==1.0.0` |
| `slug>=X.Y.Z` | Minimum version | `git-workflow>=1.0.0` |
| `slug^X.Y.Z` | Compatible (same major, >= specified) | `git-workflow^1.0.0` |

Versions follow semver (`major.minor.patch`). Constraints are validated at publish time — if no published version satisfies the constraint, the publish is rejected.

## Dependency Resolution

When a consumer (StrawPot CLI) installs a role:

1. Fetch role → get dependencies (skills + roles) with version constraints from frontmatter
2. For each dependency, check its own dependencies for transitive deps
3. Resolve version constraints (find best matching version for each)
4. Topological sort with cycle detection
5. Return install order with resolved versions (leaves first)

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
| `/search` | Search skills and roles |
| `/upload` | Publish — drag-and-drop files or folders, GitHub import, form auto-fill from frontmatter, update mode via `?updateSlug=` |
| `/dashboard` | My content — manage published skills and roles |
| `/settings` | Profile editing, API tokens, account deletion |

### Authentication

- GitHub OAuth sign-in via `@convex-dev/auth`
- Signed-in users see an avatar + @handle dropdown in the nav with links to Dashboard, Settings, and Sign out
- Deleted accounts are soft-deleted (`deactivatedAt`); re-signing in reactivates the account

### Publishing

- **Web UI**: Drag-and-drop files or use the GitHub import (paste a URL, files are fetched via GitHub Contents API)
- SKILL.md / ROLE.md frontmatter is auto-parsed to populate form fields (slug, display name)
- Slug ownership: if a slug already exists and belongs to another user, publishing is blocked
- Cross-kind slug uniqueness: a slug cannot be used by both a skill and a role
- Version monotonicity: new versions must be strictly greater than the latest published version; auto-incremented patch if omitted
- Dependency validation errors are aggregated — all issues are reported together rather than failing on the first one
- Zip archives nest files under `{slug}-{version}/` so they extract into a named directory
- **REST API**: `POST /api/v1/skills` and `POST /api/v1/roles` with bearer token auth (multipart form data)

### API Tokens

- Created and managed from Settings > API Tokens
- Token format: `sh_` prefix + 32 random hex bytes
- Raw token shown once on creation; only the SHA-256 hash is stored
- Tokens can be revoked from Settings

## Authorization

| Action | Who |
|--------|-----|
| Publish new skill/role | Any authenticated user |
| Update existing skill/role | Owner only |
| Delete (soft-delete) skill/role | Admin only |
| Restore skill/role | Admin only |
| Delete own account | Authenticated user (self) |

Users cannot delete their own published skills or roles. Only administrators can remove content from the registry.

### Admin Assignment

Admins are designated via the `ADMIN_GITHUB_LOGINS` Convex environment variable — a comma-separated list of GitHub logins (case-insensitive). The role is synced on every sign-in: users in the list get `admin`, everyone else gets `user`.

## Database Tables

- `users` — GitHub-authed users with profile (handle, displayName, bio), roles (admin/moderator/user), soft-delete support
- `skills` — skill registry entries with stats, badges, moderation status
- `skillVersions` — versioned skill bundles (files in Convex storage, optional skill dependency declarations)
- `skillEmbeddings` — vector embeddings for search
- `roles` — role registry entries (parallel to skills)
- `roleVersions` — versioned role bundles with skill/role dependency declarations (version specifiers)
- `roleEmbeddings` — vector embeddings for search
- `stars` — user stars on skills/roles
- `comments` — user comments on skills/roles
- `apiTokens` — SHA-256 hashed bearer tokens for CLI/API auth
- `auditLogs` — moderation action trail
- `rateLimits` — per-IP/per-token rate limiting
