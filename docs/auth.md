# Authentication

## Web (GitHub OAuth)

StrawHub uses GitHub OAuth via `@convex-dev/auth`. Single login provider.

Env vars needed on the Convex deployment:

- `AUTH_GITHUB_ID` — GitHub OAuth App client ID
- `AUTH_GITHUB_SECRET` — GitHub OAuth App client secret
- `SITE_URL` — public app URL
- `CONVEX_SITE_URL` — Convex HTTP endpoint

Setup details in the [repository README](../README.md).

Signed-in users see an avatar + @handle dropdown in the nav with links to Dashboard, Settings, and Sign out.

Deleted accounts are soft-deleted (`deactivatedAt`). Re-signing in reactivates the account.

## CLI (API tokens)

Long-lived Bearer tokens for publish, star, delete, and admin operations.

### Creating a token

1. Sign in at <https://strawhub.dev>
2. Go to Settings > API Tokens
3. Create a new token — the raw value is shown once

Token format: `sh_` prefix + 32 random hex bytes. Only the SHA-256 hash is stored server-side.

### Login

```bash
strawhub login
```

Prompts for the token interactively. The token is validated against the API and stored locally.

### Token storage

Tokens are persisted in the platform-specific config directory:

| OS | Path |
|----|------|
| Linux | `~/.config/strawhub/config.json` |
| macOS | `~/Library/Application Support/strawhub/config.json` |
| Windows | `%LOCALAPPDATA%\strawhub\config.json` |

Override with `STRAWHUB_TOKEN` environment variable.

### Revocation

Revoke tokens from Settings > API Tokens. The CLI returns `401 Unauthorized` for revoked tokens.

## Admin Assignment

Admins are designated via the `ADMIN_GITHUB_LOGINS` Convex environment variable — a comma-separated list of GitHub logins (case-insensitive). The role is synced on every sign-in.
