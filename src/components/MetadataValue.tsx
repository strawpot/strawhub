/**
 * Renders a parsed frontmatter value.
 *
 * - Primitives (string, number, boolean): rendered as monospaced text
 * - Arrays: rendered as a bulleted list (or inline chips for short items)
 * - Objects (or JSON strings): rendered recursively as nested key-value pairs
 */
export function MetadataValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="font-mono text-gray-500">[]</span>;
    const allSimple = value.every(
      (v) => typeof v !== "object" || v === null,
    );
    if (allSimple) {
      return (
        <ul className="list-disc list-inside space-y-0.5">
          {value.map((v, i) => (
            <li key={i} className="text-xs font-mono text-gray-300">
              {String(v)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ul className="list-disc list-inside space-y-1">
        {value.map((v, i) => (
          <li key={i} className="text-xs text-gray-300">
            <MetadataValue value={v} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="font-mono text-gray-500">{"{}"}</span>;
    return (
      <div className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="text-xs">
            <span className="font-mono text-gray-400">{k}: </span>
            {typeof v === "object" && v !== null ? (
              <div className="ml-4 mt-0.5">
                <MetadataValue value={v} />
              </div>
            ) : (
              <span className="font-mono text-gray-300">{String(v)}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Try to detect and format JSON strings
  const jsonObj = tryParseJson(value);
  if (jsonObj !== undefined) {
    return <MetadataValue value={jsonObj} />;
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
