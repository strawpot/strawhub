# Security + Moderation

## Permission tiers

| Role | Capabilities |
|------|-------------|
| User | Publish, star, comment, report |
| Moderator | Soft-delete content, manage reports |
| Admin | All moderator capabilities + user management (ban, role assignment) |

## Content ownership

- Only the **owner** can publish new versions of an existing skill, role, agent, or memory
- Users **cannot** delete their own content — only admins can soft-delete
- Slug ownership is per-type: skills, roles, agents, and memories each have separate namespaces

## Reporting

Users can report skills, roles, agents, memories, and comments for moderation review.

## Moderation

Public queries exclude soft-deleted content. Admin queries retain access to deleted items for review and restoration.

Admins can:
- Soft-delete and restore skills, roles, agents, and memories
- Ban and unban users
- Assign user roles (admin, moderator, user)

All moderation actions are logged in the `auditLogs` table.

## Banning

Banning a user blocks API access and hides their content. The ban reason is stored for audit purposes.

```bash
strawhub ban-user <handle> --reason "spam"
strawhub ban-user <handle> --unban
```

## Account deletion

Users can delete their own account from Settings. Deletion is a soft-delete (`deactivatedAt` timestamp). Re-signing in with GitHub reactivates the account. Published content is preserved.

## Admin assignment

Admins are designated via the `ADMIN_GITHUB_LOGINS` Convex environment variable — a comma-separated list of GitHub logins (case-insensitive). The role is synced on every sign-in: users in the list get `admin`, everyone else gets `user`.

## API tokens

- Token format: `sh_` prefix + 32 random hex bytes
- Only the SHA-256 hash is stored server-side
- Raw token shown once on creation
- Tokens can be revoked from Settings

## Rate limiting

All rate limits are per IP address.

| Bucket | Limit |
|--------|-------|
| Read | 100/min |
| Write | 10/min |
| Search | 30/min |

## Upload constraints

### Skills and Roles
- Max 20 files per package, 512 KB each
- Allowed extensions: `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`
- Roles must contain exactly one file (`ROLE.md`)

### Agents and Memories
- Max 50 files per package, 10 MB each, 50 MB total
- Supports binary files (compiled executables, data files)

### All types
- Version monotonicity: new versions must be strictly greater than the latest
- Dependency constraints are validated at publish time
