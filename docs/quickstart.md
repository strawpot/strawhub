# Quickstart

## Prerequisites

- Node.js 22+
- Python 3.10+ (for CLI)
- A [Convex](https://convex.dev) project
- A [GitHub OAuth App](https://github.com/settings/developers)
- OpenAI API key (for search embeddings)

## 1) Local dev (web + Convex)

```bash
npm install

# Terminal A — Convex backend
npx convex dev

# Terminal B — Vite frontend
npx vite dev
```

Or run both together:

```bash
npm run dev
```

Set Convex environment variables (see [Deployment](deploy.md) for the full list):

```bash
npx convex env set AUTH_GITHUB_ID <your-github-client-id>
npx convex env set AUTH_GITHUB_SECRET <your-github-client-secret>
npx convex env set SITE_URL http://localhost:5173
```

Generate auth keys:

```bash
npx @convex-dev/auth setup
```

## 2) Install the CLI

```bash
pip install strawhub
```

## 3) Search and install

```bash
strawhub search "code review"
strawhub install skill code-review
strawhub install role implementer
strawhub list
```

Install to the global directory:

```bash
strawhub install skill git-workflow --global
```

Update all installed packages:

```bash
strawhub update --all
```

## 4) Authenticate

Create an API token at <https://strawhub.dev/settings>, then:

```bash
strawhub login
strawhub whoami
```

## 5) Publish a skill

Create a directory with a `SKILL.md`:

```bash
mkdir my-skill && cd my-skill
cat > SKILL.md <<'EOF'
---
name: my-skill
description: "A demo skill"
---

# My Skill

Instructions for the agent.
EOF
```

Publish:

```bash
strawhub publish skill . --version 1.0.0 --changelog "Initial release"
```

## 6) Publish a role

Create a directory with a `ROLE.md`:

```bash
mkdir my-role && cd my-role
cat > ROLE.md <<'EOF'
---
name: my-role
description: "A demo role"
metadata:
  strawpot:
    dependencies:
      skills:
        - my-skill
---

# My Role

Role instructions.
EOF
```

Publish:

```bash
strawhub publish role . --version 1.0.0 --changelog "Initial release"
```

## 7) Publish an agent

Create a directory with an `AGENT.md`:

```bash
mkdir my-agent && cd my-agent
cat > AGENT.md <<'EOF'
---
name: my-agent
description: "A demo agent"
---

# My Agent

Agent instructions.
EOF
```

Publish:

```bash
strawhub publish agent . --version 1.0.0 --changelog "Initial release"
```

## 8) Publish a memory

Create a directory with a `MEMORY.md`:

```bash
mkdir my-memory && cd my-memory
cat > MEMORY.md <<'EOF'
---
name: my-memory
description: "A demo memory"
---

# My Memory

Persistent context for the agent.
EOF
```

Publish:

```bash
strawhub publish memory . --version 1.0.0 --changelog "Initial release"
```

## 9) Project file

Declare dependencies in `strawpot.toml` for reproducible installs:

```bash
strawhub init
```

Or create one manually:

```toml
[skills]
git-workflow = "*"
code-review = "==2.1.0"

[roles]
implementer = "*"
```

Then install all declared dependencies:

```bash
strawhub install
```
