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
  if (typeof value === "string" && value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) {
        return (
          <pre
            className="text-xs font-mono text-gray-300"
            style={{ whiteSpace: "pre-wrap" }}
          >
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      }
    } catch {
      // Not valid JSON, fall through to plain text
    }
  }

  return <span className="font-mono">{String(value)}</span>;
}
