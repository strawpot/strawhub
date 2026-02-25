# StrawHub HTTP API v1

Base URL: `https://strawhub.ai/api/v1/`

## Authentication

Most read endpoints are public. Write endpoints require a Bearer token.

```
Authorization: Bearer sh_xxxxx
```

Tokens are created via Settings > API Tokens.

## Rate Limits

All rate limits are per IP address.

| Bucket | Limit    |
|--------|----------|
| Read   | 100/min  |
| Write  | 10/min   |
| Search | 30/min   |

A `429` response includes a `Retry-After: 60` header.

---

## Skills

### List Skills

```
GET /api/v1/skills?limit=50&sort=updated
```

Query params:
- `limit` (1-200, default 50)
- `sort` (`updated` | `downloads` | `stars`)

Response:
```json
{
  "items": [
    {
      "slug": "git-workflow",
      "displayName": "Git Workflow",
      "summary": "...",
      "stats": { "downloads": 0, "stars": 0, "versions": 1, "comments": 0 },
      "badges": {},
      "updatedAt": 1700000000000
    }
  ],
  "count": 1
}
```

### Publish Skill (auth required)

```
POST /api/v1/skills
Content-Type: multipart/form-data

payload: { slug, displayName, version, changelog, dependencies?, customTags?, files[] }
```

The `dependencies` field is optional JSON: `{"skills": ["security-baseline", "git-workflow>=1.0.0"]}`. Skills can only depend on other skills. If omitted, dependencies are read from the SKILL.md frontmatter.

File constraints: up to 20 files, 512 KB each. Allowed extensions: `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.toml`.

Additional constraints:
- Slug must be unique across both skills and roles. If the slug is already used by a role, the request is rejected.
- If the skill already has published versions, the new version must be strictly greater than the latest.
- Dependency validation errors are aggregated — all issues are reported together in a single error message.

---

## Roles

### List Roles

```
GET /api/v1/roles?limit=50&sort=updated
```

Query params:
- `limit` (1-200, default 50)
- `sort` (`updated` | `downloads` | `stars`)

Response shape matches List Skills.

### Publish Role (auth required)

```
POST /api/v1/roles
Content-Type: multipart/form-data

payload: { slug, displayName, version, changelog, dependencies?, customTags?, files[] }
```

The `dependencies` field is optional JSON: `{"skills": ["git-workflow>=1.0.0", "code-review"], "roles": ["reviewer"]}`. If omitted, dependencies are read from the ROLE.md frontmatter.

Roles must contain exactly one file named `ROLE.md`.

Additional constraints:
- Slug must be unique across both skills and roles. If the slug is already used by a skill, the request is rejected.
- If the role already has published versions, the new version must be strictly greater than the latest.
- Dependency validation errors are aggregated — all issues are reported together in a single error message.

---

## Search

### Search Skills and Roles

```
GET /api/v1/search?q=review&kind=all&limit=20
```

Query params:
- `q` (required) — search query
- `kind` (`all` | `skill` | `role`, default `all`)
- `limit` (1-100, default 20)

Uses hybrid ranking: vector similarity + lexical matching + popularity boost.

---

## Auth

### Whoami

```
GET /api/v1/whoami
Authorization: Bearer sh_xxxxx
```

Returns current user info: `{ handle, displayName, email, role, image }`.
