# StrawHub CLI Reference

Complete reference for the `strawhub` command-line interface.

```
pip install strawhub
```

> **Cross-platform:** The CLI runs on macOS, Linux, and Windows. Examples in this document use Unix shell syntax (`bash`, `$` prompt) but the commands themselves work on all platforms.

## Command Overview

```
strawhub [--version] [--help] <command>
```

| Command | Description |
|---------|-------------|
| [`install`](#install) | Install from project file or install a specific package |
| [`uninstall`](#uninstall) | Remove a package and clean up orphaned dependencies |
| [`update`](#update) | Update packages to their latest versions |
| [`init`](#init) | Create `strawpot.toml` from installed packages |
| [`search`](#search) | Search for skills and roles |
| [`info`](#info) | Show detailed information about a package |
| [`list`](#list) | List available skills and roles |
| [`resolve`](#resolve) | Resolve a package to its installed path and dependencies |
| [`publish`](#publish) | Publish a package to the registry |
| [`install-tools`](#install-tools) | Install system tools declared by packages |
| [`star`](#star) / [`unstar`](#unstar) | Star or unstar a package |
| [`login`](#login) / [`logout`](#logout) / [`whoami`](#whoami) | Authentication |
| [`delete`](#delete) | Soft-delete a package (admin) |
| [`ban-user`](#ban-user) | Ban or unban a user (admin) |
| [`set-role`](#set-role) | Set a user's role (admin) |

---

## Package Management

### `install`

Install a skill or role with all dependencies. When called without a subcommand, installs all dependencies declared in `strawpot.toml`.

#### Bare install (from project file)

```bash
strawhub install [--skip-tools] [--yes]
```

Reads `strawpot.toml` from the current directory and installs all listed dependencies. For each entry, if the currently installed version already satisfies the constraint, it is skipped. Otherwise the package is installed or reinstalled.

- For `==X.Y.Z` constraints: installs the exact specified version.
- For `^X.Y.Z`, `>=X.Y.Z`, and `*` constraints: installs the latest version from the registry.

| Option | Description |
|--------|-------------|
| `--skip-tools` | Skip running system tool install commands after installation |
| `--yes`, `-y` | Automatically confirm tool install prompts without asking |

**Example:**

```
$ strawhub install
  skill 'git-workflow' v1.2.0 satisfies ^1.0.0 (skip)
  skill 'code-review' v2.0.0 does not satisfy ==2.1.0, reinstalling...
✓ Installed skill 'code-review' v2.1.0
✓ All dependencies from strawpot.toml installed.
```

#### Install a specific package

```bash
strawhub install skill <slug> [options]
strawhub install role <slug> [options]
```

Installs a skill or role from the StrawHub registry. Dependencies are resolved automatically — for skills via client-side frontmatter parsing, for roles via the server-side resolve endpoint.

| Option | Description |
|--------|-------------|
| `--global` | Install to the global directory (`~/.strawpot` or `STRAWPOT_HOME`) |
| `--version <ver>` | Install a specific version instead of latest |
| `--force` | Force replace an existing installation (requires `--version`) |
| `--update` | Update to the latest version if already installed |
| `--recursive` | With `--update`, also update all dependencies to latest |
| `--save` | Save to `strawpot.toml` with `^X.Y.Z` constraint |
| `--save-exact` | Save to `strawpot.toml` with `==X.Y.Z` constraint |
| `--skip-tools` | Skip running system tool install commands |
| `--yes`, `-y` | Automatically confirm tool install prompts |

**Option validation rules:**

- `--recursive` requires `--update`
- `--force` requires `--version`
- `--update` and `--version` cannot be used together
- `--save` and `--save-exact` cannot be used together
- `--save` / `--save-exact` cannot be used with `--global`

**Install behavior:**

- **Default**: Skip if any version of the slug is already installed (local or global). If the package exists in the target scope, it is registered as a direct install.
- **`--version`**: Install the specified version. Errors if the slug is already installed unless `--force` is given, in which case the existing version is replaced.
- **`--update`**: Fetch the latest version from the registry. If the installed version is already the latest, skip. Otherwise remove the old version and install the new one.
- **`--update --recursive`**: Same as `--update`, but also updates all transitive dependencies to their latest versions.

**Dependency resolution:**

- **Skills**: Client-side resolution. Recursively fetches `SKILL.md` frontmatter from the registry, reads `metadata.strawpot.dependencies`, and performs a DFS to build a transitive dependency list (leaves first).
- **Roles**: Server-side resolution. Calls the `/api/v1/roles/<slug>/resolve` endpoint, which returns a topologically sorted list of all transitive skill and role dependencies.

After installation, system tool requirements declared in `metadata.strawpot.tools` are checked and install commands are run for missing tools (unless `--skip-tools`).

**Examples:**

```bash
# Install latest version
strawhub install skill code-review

# Install specific version
strawhub install skill code-review --version 2.1.0

# Force replace existing
strawhub install skill code-review --version 2.1.0 --force

# Update to latest
strawhub install skill code-review --update

# Update package and all its dependencies
strawhub install skill code-review --update --recursive

# Install globally
strawhub install role implementer --global

# Install and save to project file
strawhub install skill code-review --save

# Install and save exact version
strawhub install skill code-review --save-exact
```

---

### `uninstall`

Remove an installed skill or role and clean up orphaned dependencies.

```bash
strawhub uninstall skill <slug> [options]
strawhub uninstall role <slug> [options]
```

| Option | Description |
|--------|-------------|
| `--version <ver>` | Remove a specific version (removes all versions of the slug if omitted) |
| `--global` | Remove from the global directory |
| `--save` | Also remove the entry from `strawpot.toml` |

**Option validation:**

- `--save` cannot be used with `--global`

**Behavior:**

1. Finds matching direct installs in the lockfile
2. Removes them from the direct installs list
3. Collects orphaned packages (cascading — removing a package may cause its dependencies to become orphans)
4. Deletes orphaned package directories from disk
5. Updates the lockfile
6. If `--save`, removes the entry from `strawpot.toml`

**Examples:**

```bash
# Uninstall a skill
strawhub uninstall skill code-review

# Uninstall a specific version
strawhub uninstall skill code-review --version 1.0.0

# Uninstall from global
strawhub uninstall role implementer --global

# Uninstall and remove from project file
strawhub uninstall skill code-review --save
```

---

### `update`

Update installed skills and roles to their latest versions.

```bash
strawhub update skill <slug> [options]
strawhub update role <slug> [options]
strawhub update --all [options]
```

| Option | Description |
|--------|-------------|
| `--all` | Update all installed packages (direct installs) |
| `--global` | Update in the global directory |
| `--save` | Update version constraints in `strawpot.toml` to match newly installed versions |
| `--skip-tools` | Skip running system tool install commands |
| `--yes`, `-y` | Automatically confirm tool install prompts |

**Option validation:**

- `--save` cannot be used with `--global`

Under the hood, `update` calls `install` with `--update` flag. If the installed version is already the latest, it is skipped.

**`--save` behavior:**

When `--save` is used, the version constraint in `strawpot.toml` is updated to reflect the newly installed version. The **constraint operator is preserved** — only the version number changes:

| Before | Installed | After |
|--------|-----------|-------|
| `^1.0.0` | `1.3.0` | `^1.3.0` |
| `==1.0.0` | `2.0.0` | `==2.0.0` |
| `>=1.0.0` | `1.5.0` | `>=1.5.0` |
| `*` | `3.0.0` | `*` (unchanged) |

Only packages already listed in `strawpot.toml` are affected. Packages not in the project file are silently skipped.

**Examples:**

```bash
# Update a specific skill
strawhub update skill code-review

# Update all packages
strawhub update --all

# Update all and save to project file
strawhub update --all --save

# Update a specific role and save
strawhub update role implementer --save

# Update global packages
strawhub update --all --global
```

---

### `init`

Create `strawpot.toml` from currently installed local packages.

```bash
strawhub init [--force] [--exact]
```

Reads the local lockfile (`.strawpot/strawpot.lock`) and writes all direct installs to `strawpot.toml`.

| Option | Description |
|--------|-------------|
| `--force` | Overwrite an existing `strawpot.toml` |
| `--exact` | Use `==X.Y.Z` constraints instead of the default `^X.Y.Z` |

Errors if:
- `strawpot.toml` already exists (without `--force`)
- No local packages are installed

**Examples:**

```bash
# Create project file with compatible constraints
strawhub init

# Create project file with exact version pins
strawhub init --exact

# Overwrite existing project file
strawhub init --force
```

---

### `install-tools`

Install system tools declared by installed packages.

```bash
strawhub install-tools [--global] [--yes]
```

Scans all installed skills and roles for `metadata.strawpot.tools` in their frontmatter. For each declared tool, checks if it is available on `PATH` and runs the OS-specific install command if missing.

| Option | Description |
|--------|-------------|
| `--global` | Scan global packages (`~/.strawpot` or `STRAWPOT_HOME`) |
| `--yes`, `-y` | Automatically confirm install commands without prompting |

Tools are deduplicated — if multiple packages declare the same tool, the install command runs only once.

**Examples:**

```bash
# Install missing tools for local packages
strawhub install-tools

# Auto-confirm all prompts
strawhub install-tools --yes

# Scan global packages
strawhub install-tools --global
```

---

## Discovery

### `search`

Search for skills and roles in the registry.

```bash
strawhub search <query> [--kind skill|role|all] [--limit N] [--json]
```

| Argument | Description |
|----------|-------------|
| `<query>` | Search query string (required) |

| Option | Description |
|--------|-------------|
| `--kind` | Filter by type: `skill`, `role`, or `all` (default: `all`) |
| `--limit` | Maximum results, 1–100 (default: `20`) |
| `--json` | Output raw JSON |

**Examples:**

```bash
strawhub search "code review"
strawhub search "testing" --kind skill --limit 5
strawhub search "agent" --json
```

---

### `info`

Show detailed information about a skill or role.

```bash
strawhub info skill <slug> [--file PATH] [--json]
strawhub info role <slug> [--file PATH] [--json]
```

| Argument | Description |
|----------|-------------|
| `<slug>` | Package slug (required) |

| Option | Description |
|--------|-------------|
| `--file <path>` | View raw content of a specific file (e.g. `SKILL.md`, `ROLE.md`) |
| `--json` | Output raw JSON |

Without `--file`, displays a formatted summary: name, owner, description, latest version, published date, changelog, files, dependencies, and download/star counts.

**Examples:**

```bash
strawhub info skill code-review
strawhub info role implementer --json
strawhub info skill code-review --file SKILL.md
```

---

### `list`

List available skills and roles from the registry.

```bash
strawhub list [--kind skills|roles|all] [--limit N] [--sort updated|downloads|stars] [--json]
```

| Option | Description |
|--------|-------------|
| `--kind` | Filter by type: `skills`, `roles`, or `all` (default: `all`) |
| `--limit` | Maximum results, 1–200 (default: `50`) |
| `--sort` | Sort order: `updated`, `downloads`, or `stars` (default: `updated`) |
| `--json` | Output raw JSON |

**Examples:**

```bash
strawhub list
strawhub list --kind skills --sort stars --limit 10
strawhub list --json
```

---

## Runtime

### `resolve`

Resolve a package to its installed path and all transitive dependency paths. Outputs JSON.

```bash
strawhub resolve skill <slug> [--version <ver>] [--global]
strawhub resolve role <slug> [--version <ver>] [--global]
```

| Argument | Description |
|----------|-------------|
| `<slug>` | Package slug (required) |

| Option | Description |
|--------|-------------|
| `--version <ver>` | Resolve a specific version |
| `--global` | Only search the global directory |

Resolution checks local scope first, then global. Returns the highest installed version unless `--version` is specified. Dependencies are resolved transitively by reading frontmatter from installed `SKILL.md`/`ROLE.md` files.

**Output format:**

```json
{
  "slug": "implementer",
  "kind": "role",
  "version": "1.0.0",
  "path": "/absolute/path/.strawpot/roles/implementer-1.0.0",
  "source": "local",
  "dependencies": [
    {
      "slug": "git-workflow",
      "kind": "skill",
      "version": "1.2.0",
      "path": "/absolute/path/.strawpot/skills/git-workflow-1.2.0",
      "source": "local"
    },
    {
      "slug": "code-review",
      "kind": "skill",
      "version": "2.1.0",
      "path": "/absolute/path/.strawpot/skills/code-review-2.1.0",
      "source": "global"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `slug` | Package slug |
| `kind` | `"skill"` or `"role"` |
| `version` | Resolved version |
| `path` | Absolute filesystem path to the package directory |
| `source` | `"local"` or `"global"` — which scope the package was found in |
| `dependencies` | Array of resolved transitive dependencies (same shape) |

**Examples:**

```bash
strawhub resolve skill code-review
strawhub resolve role implementer --version 1.0.0
strawhub resolve skill git-workflow --global
```

---

## Publishing

### `publish`

Publish a skill or role to the StrawHub registry. Requires authentication (`strawhub login`).

```bash
strawhub publish skill [<path>] [--version <ver>] [--changelog <text>] [--tag <tag>]...
strawhub publish role [<path>] [--version <ver>] [--changelog <text>] [--tag <tag>]...
```

| Argument | Description |
|----------|-------------|
| `<path>` | Directory containing `SKILL.md` or `ROLE.md` (default: `.`) |

| Option | Description |
|--------|-------------|
| `--version <ver>` | Version to publish (overrides frontmatter version) |
| `--changelog <text>` | Changelog text for this version |
| `--tag <tag>` | Custom tag (can be specified multiple times) |

The directory must contain a `SKILL.md` (for skills) or `ROLE.md` (for roles) with valid YAML frontmatter including at least `name` (the slug). All files in the directory are included in the published package (dotfiles are skipped).

**Frontmatter requirements:**

- `name` — the package slug (required)
- `version` — semver version (optional if `--version` is provided)
- `description` — one-line summary

**Version rules:**

- New versions must be strictly greater than the latest published version
- If no version is specified (in frontmatter or `--version`), the patch version is auto-incremented

**Examples:**

```bash
# Publish from current directory
strawhub publish skill

# Publish from a specific directory
strawhub publish skill ./my-skill

# Publish with version and changelog
strawhub publish role ./my-role --version 2.0.0 --changelog "Major rewrite"

# Publish with tags
strawhub publish skill --tag python --tag testing
```

---

## Social

### `star`

Star a skill or role. Requires authentication.

```bash
strawhub star skill <slug>
strawhub star role <slug>
```

### `unstar`

Remove a star from a skill or role. Requires authentication.

```bash
strawhub unstar skill <slug>
strawhub unstar role <slug>
```

---

## Authentication

### `login`

Authenticate with your StrawHub API token.

```bash
strawhub login
```

Prompts for an API token (generated at <https://strawhub.dev/settings>). Tokens must start with `sh_`. The token is validated against the API and stored in the platform-specific config directory (`~/.config/strawhub/config.json` on Linux, `~/Library/Application Support/strawhub/config.json` on macOS, `%LOCALAPPDATA%\strawhub\config.json` on Windows).

### `logout`

Remove the stored API token.

```bash
strawhub logout
```

### `whoami`

Show the currently authenticated user.

```bash
strawhub whoami [--json]
```

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON |

---

## Administration

These commands require admin privileges.

### `delete`

Soft-delete a skill or role from the registry.

```bash
strawhub delete skill <slug> [--yes]
strawhub delete role <slug> [--yes]
```

| Option | Description |
|--------|-------------|
| `--yes` | Skip the confirmation prompt |

Prompts for confirmation before deleting unless `--yes` is given.

### `ban-user`

Ban or unban a user.

```bash
strawhub ban-user <handle> [--reason <text>] [--unban]
```

| Argument | Description |
|----------|-------------|
| `<handle>` | User handle (required) |

| Option | Description |
|--------|-------------|
| `--reason <text>` | Reason for the ban |
| `--unban` | Unban the user instead of banning |

### `set-role`

Set a user's role.

```bash
strawhub set-role <handle> <role>
```

| Argument | Description |
|----------|-------------|
| `<handle>` | User handle (required) |
| `<role>` | Role to assign: `admin`, `moderator`, or `user` (required) |

---

## Project File (`strawpot.toml`)

The project file declares dependencies with version constraints. It lives in the project root and uses TOML format.

```toml
[skills]
git-workflow = "^1.0.0"
code-review = "==2.1.0"
security-baseline = "*"

[roles]
implementer = "^1.0.0"
reviewer = ">=2.0.0"
```

### Version Constraints

| Format | Meaning | Example |
|--------|---------|---------|
| `"*"` | Accept any version (install latest) | `security-baseline = "*"` |
| `"^X.Y.Z"` | Compatible — same major version, >= specified | `git-workflow = "^1.0.0"` |
| `"==X.Y.Z"` | Exact — must be this specific version | `code-review = "==2.1.0"` |
| `">=X.Y.Z"` | Minimum — any version >= specified | `reviewer = ">=2.0.0"` |

See [Project File documentation](project-file.md) for full details on workflows and behavior.

---

## Directory Structure

### Local scope (project-level)

```
./
├── strawpot.toml              # Project file (human-editable, committed to VCS)
└── .strawpot/                 # Local package store
    ├── skills/
    │   ├── code-review-2.1.0/
    │   │   ├── SKILL.md
    │   │   └── ...
    │   └── git-workflow-1.2.0/
    │       └── SKILL.md
    ├── roles/
    │   └── implementer-1.0.0/
    │       └── ROLE.md
    └── strawpot.lock          # Auto-generated lockfile (JSON)
```

### Global scope

```
~/.strawpot/                   # Or STRAWPOT_HOME
├── skills/
│   └── ...
├── roles/
│   └── ...
└── strawpot.lock
```

> **Note:** `~` resolves to the user home directory on all platforms (e.g. `C:\Users\<username>` on Windows). Use the `STRAWPOT_HOME` environment variable to override.

### Scope resolution

- **Install**: defaults to local (`.strawpot/`). Use `--global` for global.
- **Resolve**: checks local first, then global. Local takes priority.
- **Project file**: local only. `--save` flags are incompatible with `--global`.

---

## System Tool Management

Skills and roles can declare system tool requirements in their frontmatter:

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
```

### When tools are checked

- **During `install`/`update`**: After package installation, declared tools are checked and install commands are run for missing ones (unless `--skip-tools`).
- **Via `install-tools`**: Re-scans all installed packages for tool declarations. Useful for reprovisioning.

### Tool install behavior

1. Detect current OS (`macos`, `linux`, `windows`)
2. For each declared tool, check if it's on `PATH`
3. If missing, prompt the user before running the install command (or auto-confirm with `--yes`)
4. Tool names are deduplicated — if multiple packages declare the same tool, it is installed once
5. On Windows, install commands run via `cmd.exe` — package authors should ensure `windows` commands use compatible syntax
6. Failed installs are logged as warnings but do not abort the main operation

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `STRAWHUB_API_URL` | Override the API endpoint | `https://strawhub.dev` |
| `STRAWHUB_TOKEN` | Override the auth token | _(from `strawhub login`)_ |
| `STRAWPOT_HOME` | Override the global install directory | `~/.strawpot` |

### Config File

Settings are persisted in the platform-specific config directory (resolved via [`platformdirs`](https://pypi.org/project/platformdirs/)). Default locations:

| OS | Path |
|----|------|
| Linux | `~/.config/strawhub/config.json` |
| macOS | `~/Library/Application Support/strawhub/config.json` |
| Windows | `%LOCALAPPDATA%\strawhub\config.json` |

Currently stores:

- `token` — API authentication token (set via `strawhub login`)

---

## Errors

| Error | Cause |
|-------|-------|
| `AuthError` | Invalid or missing API token (HTTP 401) |
| `NotFoundError` | Package or resource not found (HTTP 404) |
| `RateLimitError` | Too many requests (HTTP 429) |
| `APIError` | Other API errors (HTTP 4xx/5xx) |
| `DependencyError` | Failed to resolve dependencies (missing package, circular dependency) |
| `LockfileError` | Corrupted or unreadable lockfile |

---

## Version

```bash
strawhub --version
```

Current version: **0.1.0**

Requires Python >= 3.10.
