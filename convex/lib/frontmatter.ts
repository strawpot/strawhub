/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { frontmatter, body }.
 *
 * Supports one level of nesting for objects with sub-key arrays:
 *   dependencies:
 *     skills:
 *       - git-workflow
 *     roles:
 *       - reviewer
 *   → { dependencies: { skills: ["git-workflow"], roles: ["reviewer"] } }
 */
export function parseFrontmatter(text: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = text.match(/^---\s*\n([\s\S]*?\n)---\s*\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: text };
  }

  const yamlStr = match[1];
  const body = match[2];

  const frontmatter: Record<string, unknown> = {};
  const lines = yamlStr.split("\n");

  // State for top-level arrays (e.g. dependencies:\n  - a\n  - b)
  let currentKey = "";
  let currentArray: string[] | null = null;

  // State for nested objects (e.g. dependencies:\n  skills:\n    - a)
  let nestedParentKey = "";
  let nestedObject: Record<string, string[]> | null = null;
  let nestedSubKey = "";
  let nestedSubArray: string[] | null = null;

  function flushNested() {
    if (nestedObject !== null) {
      if (nestedSubArray !== null && nestedSubKey) {
        nestedObject[nestedSubKey] = nestedSubArray;
        nestedSubArray = null;
        nestedSubKey = "";
      }
      frontmatter[nestedParentKey] = nestedObject;
      nestedObject = null;
      nestedParentKey = "";
    }
  }

  function flushArray() {
    if (currentArray !== null) {
      frontmatter[currentKey] = currentArray;
      currentArray = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Determine indentation (leading spaces)
    const indent = line.search(/\S/);

    // Inside nested object (indent >= 2)
    if (nestedObject !== null && indent >= 2) {
      // Array item under a sub-key (indent >= 4, starts with "- ")
      if (trimmed.startsWith("- ") && nestedSubArray !== null) {
        nestedSubArray.push(trimmed.slice(2).trim());
        continue;
      }

      // Sub-key (e.g. "skills:" at indent 2+)
      const subKvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
      if (subKvMatch) {
        // Flush previous sub-key array
        if (nestedSubArray !== null && nestedSubKey) {
          nestedObject[nestedSubKey] = nestedSubArray;
        }
        const [, subKey, subRawValue] = subKvMatch;
        const subValue = subRawValue.trim();
        if (!subValue) {
          nestedSubKey = subKey;
          nestedSubArray = [];
        } else if (subValue.startsWith("[") && subValue.endsWith("]")) {
          nestedObject[subKey] = subValue
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
          nestedSubKey = "";
          nestedSubArray = null;
        }
        continue;
      }
      continue;
    }

    // Top-level array item
    if (trimmed.startsWith("- ") && currentArray !== null) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // Flush any pending state before processing a new top-level key
    flushNested();
    flushArray();

    // Top-level key: value pair
    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      const value = rawValue.trim();

      if (!value) {
        // Peek at next non-empty line to decide: array or nested object?
        let peekIdx = i + 1;
        while (peekIdx < lines.length && !lines[peekIdx].trim()) peekIdx++;
        if (peekIdx < lines.length) {
          const peekTrimmed = lines[peekIdx].trim();
          const peekIndent = lines[peekIdx].search(/\S/);
          if (
            peekIndent >= 2 &&
            !peekTrimmed.startsWith("- ") &&
            peekTrimmed.match(/^(\w[\w-]*):\s*(.*)$/)
          ) {
            // Next indented line is a sub-key → nested object
            nestedParentKey = key;
            nestedObject = {};
            nestedSubKey = "";
            nestedSubArray = null;
            continue;
          }
        }
        // Default: start of array
        currentKey = key;
        currentArray = [];
        continue;
      }

      // Inline array: [a, b, c]
      if (value.startsWith("[") && value.endsWith("]")) {
        frontmatter[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        continue;
      }

      // Quoted string
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        frontmatter[key] = value.slice(1, -1);
        continue;
      }

      // Boolean
      if (value === "true") { frontmatter[key] = true; continue; }
      if (value === "false") { frontmatter[key] = false; continue; }

      // Number
      if (/^\d+(\.\d+)?$/.test(value)) {
        frontmatter[key] = parseFloat(value);
        continue;
      }

      frontmatter[key] = value;
    }
  }

  // Flush any remaining state
  flushNested();
  flushArray();

  return { frontmatter, body };
}
