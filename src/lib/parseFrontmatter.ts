/**
 * Parse YAML frontmatter from a markdown string.
 * Client-side port of convex/lib/frontmatter.ts.
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
  let currentKey = "";
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("- ") && currentArray !== null) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    if (currentArray !== null) {
      frontmatter[currentKey] = currentArray;
      currentArray = null;
    }

    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      const value = rawValue.trim();

      if (!value) {
        currentKey = key;
        currentArray = [];
        continue;
      }

      if (value.startsWith("[") && value.endsWith("]")) {
        frontmatter[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        continue;
      }

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        frontmatter[key] = value.slice(1, -1);
        continue;
      }

      if (value === "true") {
        frontmatter[key] = true;
        continue;
      }
      if (value === "false") {
        frontmatter[key] = false;
        continue;
      }

      if (/^\d+(\.\d+)?$/.test(value)) {
        frontmatter[key] = parseFloat(value);
        continue;
      }

      frontmatter[key] = value;
    }
  }

  if (currentArray !== null) {
    frontmatter[currentKey] = currentArray;
  }

  return { frontmatter, body };
}
