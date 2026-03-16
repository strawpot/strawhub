# StrawHub Design

StrawHub is the public registry for [StrawPot](https://strawpot.com) agent skills, roles, agents, memories, and integrations. Users discover, publish, and install reusable agent components through a web UI, REST API, or Python CLI.

## System Architecture

Three-tier monorepo: React frontend, Convex backend, Python CLI.

```
┌─────────────────────────────────────────────────────────┐
│                      Clients                            │
│                                                         │
│   ┌──────────────┐    ┌──────────────┐                  │
│   │   Web App    │    │  Python CLI  │                  │
│   │  (React SPA) │    │  (PyPI pkg)  │                  │
│   └──────┬───────┘    └──────┬───────┘                  │
│          │                   │                          │
│     Convex client        REST API                       │
│     (real-time)       (Bearer token)                    │
└──────────┼───────────────────┼──────────────────────────┘
           │                   │
┌──────────▼───────────────────▼──────────────────────────┐
│                    Convex Backend                       │
│                                                         │
│   ┌────────────┐  ┌──────────┐  ┌────────────────────┐  │
│   │  Queries / │  │ HTTP API │  │  Actions           │  │
│   │  Mutations │  │   v1     │  │  (OpenAI, VT, GH)  │  │
│   └─────┬──────┘  └────┬─────┘  └─────────┬──────────┘  │
│         │              │                   │            │
│   ┌─────▼──────────────▼───────────────────▼──────────┐ │
│   │              Convex DB + _storage                 │ │
│   └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Frontend** (`src/`) — Vite + React 19 + TanStack Router + Tailwind CSS v4. File-based routing, dark theme with orange accents. Connects to Convex via real-time client for queries/mutations.

**Backend** (`convex/`) — Convex serverless platform. Database, file storage, authentication, HTTP actions, and scheduled jobs all run here. No separate server to manage.

**CLI** (`cli/`) — Python Click-based CLI published to PyPI as `strawhub`. Communicates with the backend exclusively through the REST API using Bearer token auth.

## Open vs Hosted Boundary

StrawHub has two layers: an **open package format** and a **hosted registry service**.

### Open layer (format + CLI)

Everything needed to create, validate, and install packages locally:

- **Package format** — YAML frontmatter + Markdown body in `SKILL.md`, `ROLE.md`, `AGENT.md`, `MEMORY.md`, or `INTEGRATION.md`. Plain files, no proprietary encoding.
- **Dependency spec** — Skills declare flat dependency lists; roles declare structured `skills` + `roles` dependencies. Resolution is deterministic and can run client-side.
- **File constraints** — Max 100 files, 10 MB each, 50 MB total. Slug format: lowercase alphanumeric + hyphens, max 64 chars. Semver versioning.
- **CLI** — `strawhub validate` checks a package locally. `strawhub install` / `publish` / `resolve` work against any registry endpoint (override via `STRAWHUB_API_URL`).

The format and CLI are MIT-licensed. Anyone can build tools that produce or consume StrawHub packages without depending on strawhub.dev.

### Hosted layer (strawhub.dev)

The registry service adds discovery, trust, and namespace management:

- **Search & discovery** — Hybrid vector + lexical search, download rankings, curated tags
- **Namespace ownership** — First publisher owns the slug per content type. Only the owner can push new versions.
- **Trust signals** — VirusTotal malware scanning, download stats, star counts, moderation reports
- **Authentication** — GitHub OAuth for web, Bearer tokens for API/CLI
- **Moderation** — Admin soft-delete, user bans, audit logging

The hosted layer runs on Convex (serverless backend) + Vercel (frontend). It is the default registry but not the only possible one — the CLI's `STRAWHUB_API_URL` env var can point to any compatible endpoint.

## Content Model

Five content types, split into **core** (roles and skills — the dependency graph) and **extensions** (agents, memories, integrations — standalone packages):

### Skills

Markdown instruction modules that agents load into context. Based on the [Agent Skills](https://agentskills.io/) open spec, extended with `metadata.strawpot` for dependencies and tool declarations.

- **Files:** `SKILL.md` (required) + supporting text files (optional, up to 100 files, 10 MB each, 50 MB total)
- **Dependencies:** flat list of other skill slugs
- **Allowed file types:** `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`

### Roles

Agent behavior definitions — instructions, default agent runtime, and dependency declarations.

- **Files:** exactly one `ROLE.md`
- **Dependencies:** structured object with `skills` and `roles` sub-keys
- **Can specify:** `default_agent` for runtime binding

### Agents

CLI wrapper binaries that translate StrawPot's protocol into native AI tool interfaces. Agents contain an `AGENT.md` frontmatter file plus compiled binaries per OS.

- **Files:** `AGENT.md` (required) + binary files (up to 100 files, 10 MB each, 50 MB total)
- **Dependencies:** none (agents are standalone)
- **Allowed file types:** any (binaries allowed)
- **Unique fields:** `bin` (OS-specific binary paths), `params`, `tools`, `env`

### Memories

Persistent knowledge banks that store context, patterns, and learned information across agent sessions.

- **Files:** `MEMORY.md` (required) + supporting files (up to 100 files, 10 MB each, 50 MB total)
- **Dependencies:** none (memories are standalone)
- **Allowed file types:** any (binaries allowed)

### Integrations

Adapter packages that connect StrawPot to external services (e.g., Telegram, Slack). Integrations are **global-only** — they always install to `~/.strawpot/integrations/`.

- **Files:** `INTEGRATION.md` (required) + supporting files (up to 100 files, 10 MB each, 50 MB total)
- **Dependencies:** none (integrations are standalone)
- **Allowed file types:** any (binaries allowed)
- **Scope:** global only (`~/.strawpot` or `STRAWPOT_HOME`)

### Frontmatter

All five types use YAML frontmatter for metadata. The `name` field is the package slug and must match the slug used for publishing.

```yaml
# SKILL.md
---
name: code-review
description: "Code review checklist"
metadata:
  strawpot:
    dependencies:
      - security-baseline
    tools:
      gh:
        description: GitHub CLI
        install:
          macos: brew install gh
    env:
      GITHUB_TOKEN:
        required: true
---
```

```yaml
# ROLE.md
---
name: implementer
description: "Writes code to implement features"
metadata:
  strawpot:
    dependencies:
      skills:
        - git-workflow
        - code-review
      roles:
        - reviewer
    default_agent: strawpot-claude-code
---
```

The `roles` list supports `"*"` as a wildcard meaning "all available roles." This is useful for orchestrator roles that can delegate to any installed role. The wildcard is expanded at runtime by StrawPot and filtered out during install (it is not a real package slug).

```yaml
# AGENT.md
---
name: mcp-github
description: "GitHub MCP wrapper agent"
metadata:
  strawpot:
    bin:
      macos-arm64: bin/mcp-github-darwin-arm64
      macos-x64: bin/mcp-github-darwin-x64
      linux-x64: bin/mcp-github-linux-x64
    params:
      owner:
        type: string
        required: true
    tools:
      - list_issues
      - create_pr
    env:
      GITHUB_TOKEN:
        required: true
---
```

```yaml
# MEMORY.md
---
name: project-context
description: "Persistent project context and conventions"
---
```

```yaml
# INTEGRATION.md
---
name: telegram
description: "Telegram bot adapter for StrawPot"
---
```

### Namespacing

Skills, roles, agents, memories, and integrations have **separate slug namespaces**. A skill named `foo`, a role named `foo`, an agent named `foo`, a memory named `foo`, and an integration named `foo` can all coexist. Slug ownership is enforced per-type — only the original publisher can push new versions.

## Data Model

### Core Tables

| Table | Purpose |
|-------|---------|
| `skills` | Skill registry entries: slug, owner, stats, badges, moderation status |
| `skillVersions` | Versioned bundles: files (in `_storage`), parsed frontmatter, dependencies |
| `skillEmbeddings` | OpenAI vector embeddings (1536 dims) for semantic search |
| `roles` | Role registry entries (parallel structure to skills) |
| `roleVersions` | Versioned role bundles with skill + role dependency declarations |
| `roleEmbeddings` | Vector embeddings for role search |
| `agents` | Agent registry entries (parallel structure to skills/roles) |
| `agentVersions` | Versioned agent bundles with binary files |
| `agentEmbeddings` | Vector embeddings for agent search |
| `memories` | Memory registry entries (parallel structure to skills/roles/agents) |
| `memoryVersions` | Versioned memory bundles with supporting files |
| `memoryEmbeddings` | Vector embeddings for memory search |
| `integrations` | Integration registry entries (parallel structure to skills/roles/agents/memories) |
| `integrationVersions` | Versioned integration bundles with supporting files |
| `integrationEmbeddings` | Vector embeddings for integration search |
| `users` | GitHub OAuth profiles: handle, display name, bio, role (admin/moderator/user) |
| `stars` | Polymorphic favorites (skill, role, agent, or memory) |
| `comments` | User comments on skills/roles/agents/memories |
| `reports` | Content moderation reports |
| `apiTokens` | SHA-256 hashed Bearer tokens for CLI/API auth |
| `auditLogs` | Moderation action trail |
| `statEvents` | Event-sourced download tracking (flushed by cron into target stats) |
| `counters` | Aggregated counters |
| `rateLimits` | Per-IP/per-token rate limiting buckets |

### Versioning

- Semantic versioning (X.Y.Z) enforced
- Monotonicity: new versions must be strictly greater than the latest
- Auto-increment: patch version is bumped if version is omitted
- Each version stores its own file set and parsed frontmatter independently

### File Storage

Published files are stored in Convex `_storage`. Each file entry tracks: path, size, SHA-256 hash, content type, and storage ID. Zip archives are generated on demand for batch downloads, nested under `{slug}-{version}/`.

## Key Flows

### Publishing

```
Author → (web drag-drop | GitHub import | CLI POST) → validate → store files → create version
```

1. Files uploaded via multipart form (REST API) or Convex mutation (web)
2. Frontmatter parsed; `name` field must match the target slug
3. Version validated: semver format, strictly greater than latest
4. Dependencies validated: all referenced slugs must exist in the registry
5. Files stored in `_storage`, version record created
6. OpenAI embedding generated asynchronously (graceful fallback if unavailable)
7. VirusTotal scan queued for the package

Web UI also supports **GitHub import**: paste a repo URL, files are fetched via the GitHub Contents API and auto-populated into the publish form.

### Dependency Resolution

**Skills** — server-side resolution via `GET /api/v1/skills/:slug/resolve`, or client-side DFS as fallback. The server recursively fetches frontmatter for each dependency and builds the transitive list.

**Roles** — server-side topological sort via `GET /api/v1/roles/:slug/resolve`. The server walks both skill and role dependencies, detects cycles, and returns a sorted install order (leaves first). The `"*"` wildcard in the `roles` dependency list is filtered out by the CLI before install — it is not a real dependency but a runtime directive expanded by StrawPot.

```
GET /api/v1/roles/implementer/resolve
→ { dependencies: [
    { kind: "skill", slug: "git-workflow", version: "1.2.0" },
    { kind: "skill", slug: "code-review", version: "2.0.0" },
    { kind: "role",  slug: "reviewer",    version: "1.0.0" }
  ]}
```

### Search

Hybrid search combining three signals:

1. **Vector similarity** — OpenAI `text-embedding-3-small` (1536 dims) via Convex vector index
2. **Lexical matching** — tokenized keyword matching against name/description
3. **Popularity boost** — log of download count

Searches skills, roles, agents, memories, and integrations simultaneously. Falls back to text scan if embeddings are unavailable. Soft-deleted content is excluded.

### Install (CLI)

```
CLI → resolve dependencies → fetch files → extract to ~/.strawpot/{skills,roles,agents,memories,integrations}/{slug}/
```

Install state tracked via lockfile at `.strawpot/strawpot.lock`. The installed version is stored in a `.version` file within each package directory. After installation, declared system tools are checked — missing tools trigger OS-specific install commands (with user confirmation).

## Authentication & Authorization

### Authentication

- **Web:** GitHub OAuth via `@convex-dev/auth`
- **API:** Bearer tokens (`sh_` prefix + 32 hex bytes). Only the SHA-256 hash is stored. Raw token shown once at creation.

### Authorization

| Action | Who |
|--------|-----|
| Publish new content | Any authenticated user |
| Update existing content | Owner only |
| Soft-delete / restore content | Admin |
| Ban / unban users | Admin |
| Assign user roles | Admin |
| Delete own account | Self |

Admin status is synced from the `ADMIN_GITHUB_LOGINS` env var on every sign-in.

### Rate Limiting

Per-IP windowed buckets: 100 reads/min, 10 writes/min, 30 searches/min.

## REST API (v1)

```
GET    /api/v1/skills              List skills
GET    /api/v1/skills/:slug        Skill detail
GET    /api/v1/skills/:slug/file   Raw file content
POST   /api/v1/skills              Publish skill (auth, multipart)
DELETE /api/v1/skills/:slug        Delete skill (admin)

GET    /api/v1/roles               List roles
GET    /api/v1/roles/:slug         Role detail
GET    /api/v1/roles/:slug/file    Raw file content
GET    /api/v1/roles/:slug/resolve Resolve dependencies recursively
POST   /api/v1/roles               Publish role (auth, multipart)
DELETE /api/v1/roles/:slug         Delete role (admin)

GET    /api/v1/agents              List agents
GET    /api/v1/agents/:slug        Agent detail
GET    /api/v1/agents/:slug/file   Raw file content (binary)
POST   /api/v1/agents              Publish agent (auth, multipart)
DELETE /api/v1/agents/:slug        Delete agent (admin)

GET    /api/v1/memories              List memories
GET    /api/v1/memories/:slug        Memory detail
GET    /api/v1/memories/:slug/file   Raw file content (binary)
POST   /api/v1/memories              Publish memory (auth, multipart)
DELETE /api/v1/memories/:slug        Delete memory (admin)

GET    /api/v1/integrations              List integrations
GET    /api/v1/integrations/:slug        Integration detail
GET    /api/v1/integrations/:slug/file   Raw file content (binary)
POST   /api/v1/integrations              Publish integration (auth, multipart)
DELETE /api/v1/integrations/:slug        Delete integration (admin)

GET    /api/v1/search?q=&kind=     Hybrid search
GET    /api/v1/whoami              Current user info
POST   /api/v1/stars/toggle        Toggle star (auth)
POST   /api/v1/admin/set-role      Set user role (admin)
POST   /api/v1/downloads           Track download event (public)
POST   /api/v1/admin/ban-user      Ban/unban user (admin)
POST   /api/v1/skills/:slug/claim  Claim skill ownership (admin)
```

## Directory Structure

```
strawhub/
├── src/                        # React frontend
│   ├── routes/                 # File-based routing (TanStack Router)
│   ├── components/             # Shared UI components
│   └── lib/                    # Utilities (frontmatter, GitHub import, hashing)
├── convex/                     # Convex backend
│   ├── schema.ts               # Database schema
│   ├── http.ts                 # HTTP route definitions
│   ├── skills.ts               # Skill queries/mutations
│   ├── roles.ts                # Role queries/mutations
│   ├── agents.ts               # Agent queries/mutations
│   ├── memories.ts             # Memory queries/mutations
│   ├── integrations.ts         # Integration queries/mutations
│   ├── search.ts               # Hybrid search logic
│   ├── users.ts                # User management
│   ├── httpApiV1/              # REST API v1 handlers
│   └── lib/                    # Backend utilities (validation, embeddings, rate limiting)
├── cli/                        # Python CLI
│   ├── src/strawhub/           # CLI source (Click-based)
│   │   ├── cli.py              # Entry point and command definitions
│   │   ├── client.py           # HTTP API client
│   │   ├── resolver.py         # Dependency resolution (DFS)
│   │   └── lockfile.py         # Install state tracking
│   └── tests/                  # CLI unit tests
├── docs/                       # Documentation
├── e2e/                        # Playwright E2E tests
├── tests/                      # Frontend unit tests
└── .github/workflows/          # CI/CD (GitHub Actions)
```

## External Integrations

| Service | Purpose |
|---------|---------|
| Convex | Database, file storage, auth, serverless functions |
| GitHub OAuth | User authentication |
| GitHub API | Repository import (Contents API) |
| OpenAI | Vector embeddings (`text-embedding-3-small`, 1536 dims) |
| VirusTotal | Malware scanning for published packages |
| Vercel | Frontend hosting, analytics |

## Design Decisions

**Markdown + YAML frontmatter** — Human-readable, version-controllable, compatible with the Agent Skills open spec. No custom binary formats.

**Separate dependency resolution strategies** — Skills use client-side DFS (simple, flat dependency graph). Roles use server-side topological sort (complex, mixed skill + role dependencies with cycle detection).

**Soft deletion everywhere** — Content is never hard-deleted. Preserves audit trail, enables recovery, and prevents accidental data loss. Users cannot delete their own content — only admins can.

**Convex as sole backend** — Database, file storage, auth, HTTP endpoints, and background jobs all run on Convex. No separate server infrastructure to manage or deploy.

**Separate slug namespaces** — Skills, roles, agents, memories, and integrations can share the same slug. Keeps the content types independent and avoids naming conflicts across different concerns.

**SHA-256 token hashing** — API tokens are hashed before storage. Raw token shown once at creation. Prevents token exposure from database breaches.

**Event-sourced download tracking** — Downloads are tracked by inserting lightweight events into `statEvents`. A cron job flushes accumulated events every 15 minutes, batch-patching target stats. This prevents thundering-herd query invalidation on popular items. Authenticated downloads are deduplicated per user+target+version; anonymous downloads are always counted.

**Vercel Edge Middleware for API routing** — A middleware (`middleware.ts`) rewrites `/api/v1/*` requests to the Convex site URL, using `VITE_CONVEX_SITE_URL` with a hardcoded production fallback. This enables preview deployments to route API calls to their own Convex backend.

**Optional display name with auto-generation** — `displayName` is optional on publish. If not provided, it falls back to the existing display name (on updates) or is auto-generated by title-casing the slug (e.g., `code-review` → `Code Review`).

**Hybrid search over pure vector** — Combining vector similarity with lexical matching and popularity boost produces better results than any single signal alone. Gracefully degrades when embeddings are unavailable.
