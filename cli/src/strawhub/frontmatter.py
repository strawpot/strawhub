"""Parse YAML frontmatter from markdown strings.

Supports one level of nesting for objects with sub-key arrays:
  dependencies:
    skills:
      - git-workflow
    roles:
      - reviewer
  → {"dependencies": {"skills": ["git-workflow"], "roles": ["reviewer"]}}

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

    frontmatter: dict = {}
    lines = yaml_str.split("\n")

    # State for top-level arrays
    current_key = ""
    current_array: list[str] | None = None

    # State for nested objects
    nested_parent_key = ""
    nested_object: dict[str, list[str]] | None = None
    nested_sub_key = ""
    nested_sub_array: list[str] | None = None

    def flush_nested():
        nonlocal nested_object, nested_parent_key, nested_sub_key, nested_sub_array
        if nested_object is not None:
            if nested_sub_array is not None and nested_sub_key:
                nested_object[nested_sub_key] = nested_sub_array
                nested_sub_array = None
                nested_sub_key = ""
            frontmatter[nested_parent_key] = nested_object
            nested_object = None
            nested_parent_key = ""

    def flush_array():
        nonlocal current_array
        if current_array is not None:
            frontmatter[current_key] = current_array
            current_array = None

    for i, line in enumerate(lines):
        trimmed = line.strip()
        if not trimmed:
            continue

        # Determine indentation (leading spaces)
        indent = len(line) - len(line.lstrip())

        # Inside nested object (indent >= 2)
        if nested_object is not None and indent >= 2:
            # Array item under a sub-key (starts with "- ")
            if trimmed.startswith("- ") and nested_sub_array is not None:
                nested_sub_array.append(trimmed[2:].strip())
                continue

            # Sub-key (e.g. "skills:" at indent 2+)
            sub_kv = re.match(r"^(\w[\w-]*):\s*(.*)$", trimmed)
            if sub_kv:
                # Flush previous sub-key array
                if nested_sub_array is not None and nested_sub_key:
                    nested_object[nested_sub_key] = nested_sub_array

                sub_key = sub_kv.group(1)
                sub_value = sub_kv.group(2).strip()

                if not sub_value:
                    nested_sub_key = sub_key
                    nested_sub_array = []
                elif sub_value.startswith("[") and sub_value.endswith("]"):
                    nested_object[sub_key] = [
                        s.strip().strip("\"'")
                        for s in sub_value[1:-1].split(",")
                        if s.strip()
                    ]
                    nested_sub_key = ""
                    nested_sub_array = None
                continue
            continue

        # Top-level array item
        if trimmed.startswith("- ") and current_array is not None:
            current_array.append(trimmed[2:].strip())
            continue

        # Flush any pending state before processing a new top-level key
        flush_nested()
        flush_array()

        # Top-level key: value pair
        kv = re.match(r"^(\w[\w-]*):\s*(.*)$", trimmed)
        if kv:
            key = kv.group(1)
            value = kv.group(2).strip()

            if not value:
                # Peek at next non-empty line to decide: array or nested object?
                peek_idx = i + 1
                while peek_idx < len(lines) and not lines[peek_idx].strip():
                    peek_idx += 1
                if peek_idx < len(lines):
                    peek_trimmed = lines[peek_idx].strip()
                    peek_indent = len(lines[peek_idx]) - len(lines[peek_idx].lstrip())
                    if (
                        peek_indent >= 2
                        and not peek_trimmed.startswith("- ")
                        and re.match(r"^(\w[\w-]*):\s*(.*)$", peek_trimmed)
                    ):
                        # Next indented line is a sub-key → nested object
                        nested_parent_key = key
                        nested_object = {}
                        nested_sub_key = ""
                        nested_sub_array = None
                        continue

                # Default: start of array
                current_key = key
                current_array = []
                continue

            # Inline array: [a, b, c]
            if value.startswith("[") and value.endswith("]"):
                frontmatter[key] = [
                    s.strip().strip("\"'")
                    for s in value[1:-1].split(",")
                    if s.strip()
                ]
                continue

            # Quoted string
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                frontmatter[key] = value[1:-1]
                continue

            # Boolean
            if value == "true":
                frontmatter[key] = True
                continue
            if value == "false":
                frontmatter[key] = False
                continue

            # Number
            if re.match(r"^\d+(\.\d+)?$", value):
                frontmatter[key] = float(value) if "." in value else int(value)
                continue

            frontmatter[key] = value

    # Flush any remaining state
    flush_nested()
    flush_array()

    return {"frontmatter": frontmatter, "body": body}
