import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});

function SearchPage() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "skill" | "role">("all");

  const results = useQuery(
    api.search.search,
    query.length >= 2 ? { query, limit: 30, kind } : "skip",
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold text-white">Search</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills and roles..."
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "all" | "skill" | "role")}
          className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300"
        >
          <option value="all">All</option>
          <option value="skill">Skills</option>
          <option value="role">Roles</option>
        </select>
      </div>

      {query.length < 2 ? (
        <p className="text-gray-500 text-sm">
          Type at least 2 characters to search.
        </p>
      ) : results === undefined ? (
        <div className="text-gray-500">Searching...</div>
      ) : results.length === 0 ? (
        <div className="text-gray-500">No results for "{query}".</div>
      ) : (
        <div className="grid gap-3">
          {results.map((result: any) => (
            <Link
              key={`${result.kind}-${result.slug}`}
              to={result.kind === "skill" ? "/skills/$slug" : "/roles/$slug"}
              params={{ slug: result.slug }}
              className="flex items-center gap-4 rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors"
            >
              <span className="shrink-0 rounded bg-gray-800 px-2 py-1 text-xs text-gray-400">
                {result.kind}
              </span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-white">{result.displayName}</span>
                {result.summary && (
                  <span className="ml-2 text-sm text-gray-400">{result.summary}</span>
                )}
              </div>
              <span className="text-xs text-gray-500">
                {result.stats.downloads} downloads
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
