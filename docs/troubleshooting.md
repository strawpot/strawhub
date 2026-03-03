# Troubleshooting

## Login issues

If `strawhub login` fails, verify:

1. The token starts with `sh_`
2. The token hasn't been revoked (check Settings > API Tokens)
3. The API is reachable: `curl https://strawhub.dev/api/v1/whoami`

## Auth errors

`Unauthorized (401)`: token is invalid, expired, or revoked. Re-create a token from Settings > API Tokens and run `strawhub login` again.

Check the config file location for your platform:

| OS | Path |
|----|------|
| Linux | `~/.config/strawhub/config.json` |
| macOS | `~/Library/Application Support/strawhub/config.json` |
| Windows | `%LOCALAPPDATA%\strawhub\config.json` |

## Rate limiting

`429` responses include a `Retry-After: 60` header. Wait and retry.

| Bucket | Limit |
|--------|-------|
| Read | 100/min |
| Write | 10/min |
| Search | 30/min |

Shared IPs (NAT/proxy) may hit limits faster.

## Publish fails

Common causes:

- **Missing auth**: run `strawhub login` first
- **Version not greater**: new versions must be strictly greater than the latest published version
- **Slug taken**: another user owns the slug — choose a different name
- **Dependency validation**: one or more declared dependencies don't exist or no published version satisfies the constraint. All issues are reported together
- **File too large**: max 512 KB per file, max 20 files per package
- **Missing SKILL.md / ROLE.md**: the target directory must contain the required file

## Install issues

- **Package not found**: verify the slug exists with `strawhub search <slug>` or `strawhub info skill <slug>`
- **Dependency cycle**: circular dependencies are detected and reported. Fix the dependency chain in the upstream packages
- **Tool install fails**: tool install failures are logged as warnings and do not abort the main operation. Run `strawhub install-tools --yes` to retry

## Project file issues

- **`strawhub install` does nothing**: ensure `strawpot.toml` exists in the current directory and contains entries
- **Version constraint not satisfied**: if an installed version already satisfies the constraint, it is skipped. Use `strawhub update` to get the latest

## Lockfile issues

If the lockfile (`.strawpot/strawpot.lock`) is corrupted:

1. Delete it: `rm .strawpot/strawpot.lock`
2. Re-install: `strawhub install`

## Convex deployment issues

- **Missing env vars**: verify all required variables are set with `npx convex env list`
- **Auth setup**: re-run `npx @convex-dev/auth setup` if JWT keys are missing
- **OPENAI_API_KEY**: must be set on the Convex deployment for search embeddings to work

## GitHub OAuth issues

- Ensure the OAuth App's callback URL matches your `SITE_URL`
- Verify `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` are set on the Convex deployment
