/**
 * Parse YAML frontmatter from a markdown string.
 * Supports arbitrary nesting depth via recursive descent.
 *
 * Client-side copy of convex/lib/frontmatter.ts (parseFrontmatter only).
 * Keep these two files in sync when modifying the parser logic.
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
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }

  if (raw === "true") return true;
  if (raw === "false") return false;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    return parseFloat(raw);
  }

  return raw;
}

function parseInlineValue(raw: string): unknown {
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

    if (value === ">" || value === "|") {
      // YAML folded (>) or literal (|) scalar — collect indented lines
      const parsed = parseMultilineScalar(lines, i, indent, value === ">");
      result[key] = parsed.result;
      i = parsed.nextIdx;
      continue;
    }

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

function parseMultilineScalar(
  lines: string[],
  startIdx: number,
  parentIndent: number,
  folded: boolean,
): { result: string; nextIdx: number } {
  const parts: string[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line within the scalar — preserved as paragraph break in folded mode
    if (!trimmed) {
      if (parts.length > 0) parts.push("");
      i++;
      continue;
    }

    const indent = getIndent(line);
    if (indent <= parentIndent) break;

    parts.push(trimmed);
    i++;
  }

  // Remove trailing empty parts
  while (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }

  const result = folded ? parts.join(" ") : parts.join("\n");
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
