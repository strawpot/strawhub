"""Parse YAML frontmatter from markdown strings.

Supports arbitrary nesting depth via recursive descent:
  metadata:
    strawpot:
      dependencies:
        skills:
          - git-workflow
        roles:
          - reviewer
  → {"metadata": {"strawpot": {"dependencies": {"skills": ["git-workflow"], "roles": ["reviewer"]}}}}

Python port of convex/lib/frontmatter.ts.
"""

import re


def parse_frontmatter(text: str) -> dict:
    """Parse YAML frontmatter from a markdown string.

    Returns {"frontmatter": {...}, "body": "..."}.
    """
    m = re.match(r"^---\s*\n([\s\S]*?\n)---\s*\n([\s\S]*)$", text)
    if not m:
        return {"frontmatter": {}, "body": text}

    yaml_str = m.group(1)
    body = m.group(2)
    lines = yaml_str.split("\n")

    result, _ = _parse_block(lines, 0, 0)
    return {"frontmatter": result, "body": body}


def _get_indent(line: str) -> int:
    return len(line) - len(line.lstrip())


def _skip_blanks(lines: list[str], start: int) -> int:
    i = start
    while i < len(lines) and not lines[i].strip():
        i += 1
    return i


def _parse_scalar(raw: str):
    """Parse a scalar value: quoted string, boolean, number, or bare string."""
    # Quoted string
    if (raw.startswith('"') and raw.endswith('"')) or (
        raw.startswith("'") and raw.endswith("'")
    ):
        return raw[1:-1]

    # Boolean
    if raw == "true":
        return True
    if raw == "false":
        return False

    # Number
    if re.match(r"^\d+(\.\d+)?$", raw):
        return float(raw) if "." in raw else int(raw)

    # Bare string
    return raw


def _parse_inline_value(raw: str):
    """Parse an inline value (scalar or inline array)."""
    if raw.startswith("[") and raw.endswith("]"):
        return [
            s.strip().strip("\"'")
            for s in raw[1:-1].split(",")
            if s.strip()
        ]
    return _parse_scalar(raw)


def _parse_block(
    lines: list[str], start_idx: int, base_indent: int
) -> tuple[dict, int]:
    """Recursively parse a YAML block at a given indent level.

    Returns (result_dict, next_index).
    """
    result: dict = {}
    i = start_idx

    while i < len(lines):
        line = lines[i]
        trimmed = line.strip()

        if not trimmed:
            i += 1
            continue

        indent = _get_indent(line)
        if indent < base_indent:
            break

        kv = re.match(r"^(\w[\w-]*):\s*(.*)$", trimmed)
        if not kv:
            i += 1
            continue

        key = kv.group(1)
        value = kv.group(2).strip()
        i += 1

        if value:
            result[key] = _parse_inline_value(value)
            continue

        # Empty value — peek to determine array vs nested object
        peek_idx = _skip_blanks(lines, i)

        if peek_idx >= len(lines):
            result[key] = ""
            continue

        peek_indent = _get_indent(lines[peek_idx])
        if peek_indent <= indent:
            result[key] = ""
            continue

        peek_trimmed = lines[peek_idx].strip()

        if peek_trimmed.startswith("- "):
            arr, next_idx = _parse_array(lines, peek_idx, peek_indent)
            result[key] = arr
            i = next_idx
        elif re.match(r"^(\w[\w-]*):\s*(.*)$", peek_trimmed):
            nested, next_idx = _parse_block(lines, peek_idx, peek_indent)
            result[key] = nested
            i = next_idx
        else:
            i = peek_idx + 1

    return result, i


def _parse_array(
    lines: list[str], start_idx: int, base_indent: int
) -> tuple[list[str], int]:
    """Parse consecutive '- item' lines at a given indent level.

    Returns (result_list, next_index).
    """
    result: list[str] = []
    i = start_idx

    while i < len(lines):
        line = lines[i]
        trimmed = line.strip()

        if not trimmed:
            i += 1
            continue

        indent = _get_indent(line)
        if indent < base_indent:
            break
        if not trimmed.startswith("- "):
            break

        result.append(trimmed[2:].strip())
        i += 1

    return result, i


def extract_dependencies(
    fm: dict, kind: str
) -> dict | None:
    """Extract dependencies from parsed frontmatter.

    Reads from metadata.strawpot.dependencies.
    For skills: returns {"skills": [...]} from a flat array.
    For roles: returns {"skills": [...], "roles": [...]} from a nested object.
    """
    deps = (
        fm.get("metadata", {})
        .get("strawpot", {})
        .get("dependencies")
    )

    if deps is None:
        return None

    if kind == "skill" and isinstance(deps, list):
        return {"skills": deps}
    if kind == "role" and isinstance(deps, dict):
        return deps

    return None
