# StrawHub Design

StrawHub is the public registry for [StrawPot](https://strawpot.com) agent skills, roles, and agents. Users discover, publish, and install reusable agent components through a web UI, REST API, or Python CLI.

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

## Content Model

Three content types with parallel structure:

### Skills

Markdown instruction modules that agents load into context. Based on the [Agent Skills](https://agentskills.io/) open spec, extended with `metadata.strawpot` for dependencies and tool declarations.

- **Files:** `SKILL.md` (required) + supporting text files (optional, up to 20 files, 512 KB each)
- **Dependencies:** flat list of other skill slugs
- **Allowed file types:** `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`

### Roles

Agent behavior definitions — instructions, default agent runtime, and dependency declarations.

- **Files:** exactly one `ROLE.md`
- **Dependencies:** structured object with `skills` and `roles` sub-keys
- **Can specify:** `default_agent` for runtime binding

### Agents

CLI wrapper binaries that translate StrawPot's protocol into native AI tool interfaces. Agents contain an `AGENT.md` frontmatter file plus compiled binaries per OS.

- **Files:** `AGENT.md` (required) + binary files (up to 50 files, 10 MB each, 50 MB total)
- **Dependencies:** none (agents are standalone)
- **Allowed file types:** any (binaries allowed)
- **Unique fields:** `bin` (OS-specific binary paths), `params`, `tools`, `env`

### Frontmatter

All three types use YAML frontmatter for metadata. The `name` field is the package slug and must match the slug used for publishing.

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
    default_agent: claude_code
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

### Namespacing

Skills, roles, and agents have **separate slug namespaces**. A skill named `foo`, a role named `foo`, and an agent named `foo` can all coexist. Slug ownership is enforced per-type — only the original publisher can push new versions.

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
| `users` | GitHub OAuth profiles: handle, display name, bio, role (admin/moderator/user) |
| `stars` | Polymorphic favorites (skill, role, or agent) |
| `comments` | User comments on skills/roles/agents |
| `reports` | Content moderation reports |
| `apiTokens` | SHA-256 hashed Bearer tokens for CLI/API auth |
| `auditLogs` | Moderation action trail |
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

**Skills** — client-side DFS. The CLI recursively fetches frontmatter for each dependency and builds the transitive list.

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

Searches both skills and roles simultaneously. Falls back to text scan if embeddings are unavailable. Soft-deleted content is excluded.

### Install (CLI)

```
CLI → resolve dependencies → fetch files → extract to ~/.strawpot/{skills,roles,agents}/{slug}-{version}/
```

Install state tracked via lockfile at `.strawpot/strawpot.lock`. After installation, declared system tools are checked — missing tools trigger OS-specific install commands (with user confirmation).

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

GET    /api/v1/search?q=&kind=     Hybrid search
GET    /api/v1/whoami              Current user info
POST   /api/v1/stars/toggle        Toggle star (auth)
POST   /api/v1/admin/set-role      Set user role (admin)
POST   /api/v1/admin/ban-user      Ban/unban user (admin)
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

**Separate slug namespaces** — Skills, roles, and agents can share the same slug. Keeps the content types independent and avoids naming conflicts across different concerns.

**SHA-256 token hashing** — API tokens are hashed before storage. Raw token shown once at creation. Prevents token exposure from database breaches.

**Hybrid search over pure vector** — Combining vector similarity with lexical matching and popularity boost produces better results than any single signal alone. Gracefully degrades when embeddings are unavailable.
