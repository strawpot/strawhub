import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useRef, useEffect } from "react";
import { useSEO } from "../lib/useSEO";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});

const PAGE_SIZE = 20;

function SearchPage() {
  useSEO({
    title: "Search - StrawHub",
    description: "Search for skills and roles on StrawHub.",
    url: "/search",
  });

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | "skill" | "role">("all");
  const results = useQuery(
    api.search.search,
    query.length >= 2 ? { query, limit: 100, kind } : "skip",
  );

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [prevKey, setPrevKey] = useState(`${query}\0${kind}`);
  const currentKey = `${query}\0${kind}`;
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setVisibleCount(PAGE_SIZE);
  }

  const visibleResults = results?.slice(0, visibleCount);
  const canLoadMore = results && visibleCount < results.length;

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && canLoadMore) {
          setVisibleCount((c) => c + PAGE_SIZE);
        }
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadMore]);

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
        <div className="text-gray-500">No results for &ldquo;{query}&rdquo;.</div>
      ) : (
        <div className="grid gap-4">
          {visibleResults?.map((result: any) => (
            <SearchResultCard key={`${result.kind}-${result.slug}`} result={result} />
          ))}
          <div ref={sentinelRef} />
          {canLoadMore && (
            <div className="text-center text-gray-500 text-sm py-2">Loading more...</div>
          )}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SearchResultCard({ result }: { result: any }) {
  return (
    <Link
      to={result.kind === "skill" ? "/skills/$slug" : "/roles/$slug"}
      params={{ slug: result.slug }}
      className="block rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
              {result.kind}
            </span>
            <h3 className="text-lg font-semibold text-white">{result.displayName}</h3>
            <span className="text-sm text-gray-500 font-mono">/{result.slug}</span>
          </div>
          {result.summary && (
            <p className="text-sm text-gray-400 mt-1">{result.summary}</p>
          )}
        </div>
        <div className="flex gap-4 text-xs text-gray-500 shrink-0">
          {result.totalSize > 0 && <span>{formatSize(result.totalSize)}</span>}
          {result.latestVersionString && <span>v{result.latestVersionString}</span>}
          <span>{result.stats.downloads} downloads</span>
          <span>{result.stats.stars} stars</span>
        </div>
      </div>
      {result.owner && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-500">by</span>
          {result.owner.image ? (
            <img src={result.owner.image} alt="" className="h-5 w-5 rounded-full" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-gray-700" />
          )}
          {result.owner.handle && (
            <span className="text-xs text-gray-500">@{result.owner.handle}</span>
          )}
        </div>
      )}
    </Link>
  );
}
