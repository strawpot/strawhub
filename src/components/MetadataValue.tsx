/**
 * Renders a parsed frontmatter value.
 *
 * - Primitives (string, number, boolean): rendered as monospaced text
 * - Arrays: rendered as inline badge chips
 * - Objects (or JSON strings): rendered as formatted JSON
 */
export function MetadataValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <span
            key={i}
            className="rounded bg-gray-800 px-2 py-0.5 text-xs font-mono text-gray-300"
          >
            {String(v)}
          </span>
        ))}
      </div>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <pre
        className="text-xs font-mono text-gray-300"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  // Try to detect and format JSON strings
  const jsonObj = tryParseJson(value);
  if (jsonObj !== undefined) {
    return (
      <pre
        className="text-xs font-mono text-gray-300"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {JSON.stringify(jsonObj, null, 2)}
      </pre>
    );
  }

  return <span className="font-mono">{String(value)}</span>;
}

function tryParseJson(value: unknown): object | undefined {
  if (typeof value !== "string" || !value.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch {
    // Not valid JSON
  }
  return undefined;
}
