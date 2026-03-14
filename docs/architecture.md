# Architecture

## Summary

System overview: web app + Convex backend + Python CLI.

**Read when:**
- Orienting in the codebase
- Tracing a user flow across layers

## Components

- **Web app** — Vite + React 19 + TanStack Router, lives in `src/`
- **Backend** — Convex (DB + storage + HTTP actions + auth), lives in `convex/`
- **CLI** — Python package, lives in `cli/`, published as `strawhub` on PyPI
- **Docs** — `docs/`

## Data + Storage

Four content types: **skills**, **roles**, **agents**, and **memories**, all versioned bundles of files stored in Convex `_storage`. Skills and roles are text-only; agents and memories also support binary files.

Metadata is extracted from YAML frontmatter in SKILL.md / ROLE.md / AGENT.md / MEMORY.md at publish time.
Stats (downloads, stars, comments) live on the `skills`, `roles`, `agents`, and `memories` tables.
Embeddings (OpenAI, 1536 dimensions) are stored separately for vector search.

## Main Flows

### Browse (web)

UI fetches content metadata + latest version via Convex queries.
Renders SKILL.md / ROLE.md / AGENT.md / MEMORY.md as Markdown with a frontmatter summary table.
Version history, download counts, and star counts are shown on detail pages.

### Search (HTTP)

Hybrid search via `GET /api/v1/search?q=...` — Convex action combining vector similarity + lexical matching + popularity boost.
Embeddings are generated at publish time.

### Install (CLI)

Resolves latest version via `GET /api/v1/skills/:slug` or `GET /api/v1/roles/:slug`.
Downloads file content, extracts into `.strawpot/skills/<slug>/` or `.strawpot/roles/<slug>/`. The installed version is tracked in a `.version` file within each package directory.

**Skill dependencies** are resolved client-side: the CLI recursively fetches frontmatter and performs a DFS to build a transitive dependency list.

**Role dependencies** are resolved server-side: the CLI calls `GET /api/v1/roles/:slug/resolve`, which returns a topologically sorted list of all transitive skill and role dependencies.

After installation, declared system tools are checked and install commands are run for missing ones.

Install state is tracked via a lockfile (`.strawpot/strawpot.lock`).

### Publish (CLI + web)

- **CLI**: `POST /api/v1/skills`, `POST /api/v1/roles`, `POST /api/v1/agents`, or `POST /api/v1/memories` (multipart, Bearer token)
- **Web**: drag-and-drop files or GitHub import (paste a repo URL, files are fetched via GitHub Contents API)

Version monotonicity is enforced — new versions must be strictly greater than the latest.
Dependency constraints are validated at publish time.

### Update (CLI)

Fetches the latest version from the registry, compares against installed version, replaces if newer.
`--recursive` also updates all transitive dependencies.

## Directory Layout

```
strawhub/
├── src/                    # Frontend (React + TanStack Router)
│   ├── routes/             # Page components
│   ├── components/         # Shared UI components
│   └── lib/                # Utilities (frontmatter, GitHub import)
├── convex/                 # Backend (Convex)
│   ├── httpApiV1/          # REST API v1 handlers
│   ├── lib/                # Backend utilities
│   ├── schema.ts           # Database schema
│   ├── http.ts             # HTTP route definitions
│   ├── skills.ts           # Skill queries/mutations
│   ├── roles.ts            # Role queries/mutations
│   ├── agents.ts           # Agent queries/mutations
│   └── memories.ts         # Memory queries/mutations
├── cli/                    # Python CLI
│   ├── src/strawhub/       # CLI source (Click-based)
│   └── tests/              # CLI unit tests
├── docs/                   # Documentation
└── e2e/                    # Playwright E2E tests
```
