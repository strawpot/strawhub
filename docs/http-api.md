# StrawHub HTTP API v1

Base URL: `https://strawhub.ai/api/v1/`

## Authentication

Most read endpoints are public. Write endpoints require a Bearer token.

```
Authorization: Bearer sh_xxxxx
```

Tokens are created via Settings > API Tokens.

## Rate Limits

| Bucket   | Per IP (anon) | Per Token |
|----------|--------------|-----------|
| Read     | 120/min      | 600/min   |
| Write    | 30/min       | 120/min   |
| Download | 20/min       | 120/min   |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`

---

## Skills

### List Skills

```
GET /api/v1/skills?limit=50&sort=updated
```

Query params:
- `limit` (1-200, default 50)
- `sort` (`updated` | `downloads` | `stars`)

### Get Skill

```
GET /api/v1/skills/{slug}
```

Response includes `dependencies` — `{ skills: string[] }` with optional version constraints (e.g. `{"skills": ["security-baseline", "git-workflow>=1.0.0"]}`). Skills can only depend on other skills.

### Get Skill File

```
GET /api/v1/skills/{slug}/file?path=SKILL.md
```

Returns raw file content (text/markdown).

### Get Skill Versions

```
GET /api/v1/skills/{slug}/versions
```

### Publish Skill (auth required)

```
POST /api/v1/skills
Content-Type: multipart/form-data

payload: { slug, displayName, version, changelog, dependencies?, files[] }
```

The `dependencies` field is optional JSON: `{"skills": ["security-baseline", "git-workflow>=1.0.0"]}`. Skills can only depend on other skills. If omitted, dependencies are read from the SKILL.md frontmatter.

### Delete Skill (auth required)

```
DELETE /api/v1/skills/{slug}
```

### Restore Skill (auth required)

```
POST /api/v1/skills/{slug}/undelete
```

---

## Roles

### List Roles

```
GET /api/v1/roles?limit=50&sort=updated
```

### Get Role

```
GET /api/v1/roles/{slug}
```

Response includes `dependencies` — `{ skills: string[], roles: string[] }` with optional version constraints (e.g. `{"skills": ["git-workflow>=1.0.0", "code-review"], "roles": ["reviewer"]}`).

### Get Role File

```
GET /api/v1/roles/{slug}/file?path=ROLE.md
```

### Resolve Dependencies

```
GET /api/v1/roles/{slug}/resolve
```

Returns the full transitive dependency list (skills and roles) with resolved versions in install order:

```json
{
  "role": "implementer",
  "dependencies": [
    { "kind": "skill", "slug": "security-baseline", "version": "1.0.0" },
    { "kind": "skill", "slug": "git-workflow", "version": "1.2.0" },
    { "kind": "skill", "slug": "code-review", "version": "2.0.0" },
    { "kind": "role", "slug": "reviewer", "version": "1.0.0" }
  ]
}
```

### Publish Role (auth required)

```
POST /api/v1/roles
Content-Type: multipart/form-data

payload: { slug, displayName, version, changelog, dependencies?, files[] }
```

The `dependencies` field is optional JSON: `{"skills": ["git-workflow>=1.0.0", "code-review"], "roles": ["reviewer"]}`. If omitted, dependencies are read from the ROLE.md frontmatter.

### Delete Role (auth required)

```
DELETE /api/v1/roles/{slug}
```

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

---

## Download

### Download Skill

```
GET /api/v1/download?slug=git-workflow&version=1.0.0
```

### Download Role

```
GET /api/v1/download?slug=implementer&kind=role&version=1.0.0
```
