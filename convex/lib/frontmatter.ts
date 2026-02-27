/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { frontmatter, body }.
 *
 * Supports arbitrary nesting depth via recursive descent:
 *   metadata:
 *     strawpot:
 *       dependencies:
 *         skills:
 *           - git-workflow
 *         roles:
 *           - reviewer
 *   → { metadata: { strawpot: { dependencies: { skills: ["git-workflow"], roles: ["reviewer"] } } } }
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
  const lines = yamlStr.split("\n");

  const { result } = parseBlock(lines, 0, 0);
  return { frontmatter: result, body };
}

function getIndent(line: string): number {
  return line.search(/\S/);
}

function skipBlanks(lines: string[], from: number): number {
  let i = from;
  while (i < lines.length && !lines[i].trim()) i++;
  return i;
}

function parseScalar(raw: string): unknown {
  // Quoted string
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Number
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return parseFloat(raw);
  }

  // Bare string
  return raw;
}

function parseInlineValue(raw: string): unknown {
  // Inline array: [a, b, c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  return parseScalar(raw);
}

function parseBlock(
  lines: string[],
  startIdx: number,
  baseIndent: number,
): { result: Record<string, unknown>; nextIdx: number } {
  const result: Record<string, unknown> = {};
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const indent = getIndent(line);
    if (indent < baseIndent) break;

    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const [, key, rawValue] = kvMatch;
    const value = rawValue.trim();
    i++;

    if (value) {
      result[key] = parseInlineValue(value);
      continue;
    }

    // Empty value — peek to determine array vs nested object
    const peekIdx = skipBlanks(lines, i);

    if (peekIdx >= lines.length) {
      result[key] = "";
      continue;
    }

    const peekIndent = getIndent(lines[peekIdx]);
    if (peekIndent <= indent) {
      result[key] = "";
      continue;
    }

    const peekTrimmed = lines[peekIdx].trim();

    if (peekTrimmed.startsWith("- ")) {
      const parsed = parseArray(lines, peekIdx, peekIndent);
      result[key] = parsed.result;
      i = parsed.nextIdx;
    } else if (peekTrimmed.match(/^(\w[\w-]*):\s*(.*)$/)) {
      const parsed = parseBlock(lines, peekIdx, peekIndent);
      result[key] = parsed.result;
      i = parsed.nextIdx;
    } else {
      i = peekIdx + 1;
    }
  }

  return { result, nextIdx: i };
}

function parseArray(
  lines: string[],
  startIdx: number,
  baseIndent: number,
): { result: string[]; nextIdx: number } {
  const result: string[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const indent = getIndent(line);
    if (indent < baseIndent) break;
    if (!trimmed.startsWith("- ")) break;

    result.push(trimmed.slice(2).trim());
    i++;
  }

  return { result, nextIdx: i };
}

/**
 * Extract dependencies from parsed frontmatter.
 *
 * Reads from metadata.strawpot.dependencies.
 * For skills: returns { skills: string[] } from a flat array.
 * For roles: returns { skills?: string[], roles?: string[] } from a nested object.
 */
export function extractDependencies(
  fm: Record<string, unknown>,
  kind: "skill" | "role",
): { skills?: string[]; roles?: string[] } | undefined {
  const meta = fm.metadata as Record<string, unknown> | undefined;
  const strawpot = meta?.strawpot as Record<string, unknown> | undefined;
  const deps = strawpot?.dependencies;

  if (deps == null) return undefined;

  if (kind === "skill" && Array.isArray(deps)) {
    return { skills: deps as string[] };
  }
  if (kind === "role" && typeof deps === "object" && !Array.isArray(deps)) {
    return deps as { skills?: string[]; roles?: string[] };
  }

  return undefined;
}
