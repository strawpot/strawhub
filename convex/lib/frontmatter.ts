/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { frontmatter, body }.
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

  // Simple YAML parser for frontmatter (handles key: value, arrays, nested objects)
  const frontmatter: Record<string, unknown> = {};
  const lines = yamlStr.split("\n");
  let currentKey = "";
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Array item
    if (trimmed.startsWith("- ") && currentArray !== null) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // Save previous array
    if (currentArray !== null) {
      frontmatter[currentKey] = currentArray;
      currentArray = null;
    }

    // Key: value pair
    const kvMatch = trimmed.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      const value = rawValue.trim();

      if (!value) {
        // Could be start of array or nested object
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

  // Flush final array
  if (currentArray !== null) {
    frontmatter[currentKey] = currentArray;
  }

  return { frontmatter, body };
}
