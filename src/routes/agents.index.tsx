import { useState, useRef, useEffect, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSEO } from "../lib/useSEO";

export const Route = createFileRoute("/agents/")({
  component: AgentsPage,
});

const PAGE_SIZE = 20;

function AgentsPage() {
  useSEO({
    title: "Agents - StrawHub",
    description: "Browse CLI runtimes for StrawPot. Agents execute roles and bridge StrawPot to AI platforms like Claude Code, ChatGPT, and Gemini.",
    url: "/agents",
  });

  const [filter, setFilter] = useState("");
  const trimmed = filter.trim();

  const { results, status, loadMore } = usePaginatedQuery(
    api.agents.list,
    { query: trimmed || undefined },
    { initialNumItems: PAGE_SIZE },
  );
  const { isAuthenticated } = useConvexAuth();
  const { results: starredIds } = usePaginatedQuery(
    api.stars.listStarredIds,
    {},
    { initialNumItems: 1000 },
  );
  const toggleStar = useMutation(api.stars.toggle);

  const canLoadMore = status === "CanLoadMore";
  const isLoading = status === "LoadingFirstPage";

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreCallback = useCallback(() => {
    if (canLoadMore) loadMore(PAGE_SIZE);
  }, [canLoadMore, loadMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreCallback();
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadMore, loadMoreCallback]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-white">
          Agents
        </h1>
        <Link
          to="/upload"
          search={{ kind: "agent" }}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Publish Agent
        </Link>
      </div>

      <p className="text-gray-400">
        CLI runtimes that execute roles on AI platforms. Each agent bridges
        StrawPot to a specific provider like Claude Code, ChatGPT, or Gemini.
      </p>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, slug, or summary..."
        className="w-full rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-gray-600 focus:outline-none"
      />

      {isLoading ? (
        <div className="text-gray-500">Loading...</div>
      ) : results.length === 0 ? (
        <div className="text-gray-500">
          {trimmed ? "No agents match your filter." : "No agents published yet."}
        </div>
      ) : (
        <div className="grid gap-4">
          {results.map((agent) => (
            <AgentCard
              key={agent._id}
              agent={agent}
              starred={starredIds.includes(agent._id)}
              isAuthenticated={isAuthenticated}
              onToggleStar={() => toggleStar({ targetId: agent._id, targetKind: "agent" })}
            />
          ))}
          <div ref={sentinelRef} />
          {(canLoadMore || status === "LoadingMore") && (
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

function AgentCard({
  agent,
  starred,
  isAuthenticated,
  onToggleStar,
}: {
  agent: any;
  starred: boolean;
  isAuthenticated: boolean;
  onToggleStar: () => void;
}) {
  return (
    <Link
      to="/agents/$slug"
      params={{ slug: agent.slug }}
      className="block rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{agent.displayName}</h3>
            <span className="text-sm text-gray-500 font-mono">/{agent.slug}</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">{agent.summary}</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
          {agent.totalSize > 0 && <span>{formatSize(agent.totalSize)}</span>}
          {agent.latestVersionString && <span>v{agent.latestVersionString}</span>}
          <span>{agent.stats.downloads} installs</span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isAuthenticated) onToggleStar();
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors ${
              starred
                ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                : isAuthenticated
                  ? "border-gray-700 text-gray-500 hover:border-yellow-500/40 hover:text-yellow-400"
                  : "border-gray-700 text-gray-500 cursor-default"
            }`}
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill={starred ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>
            {agent.stats.stars}
          </button>
        </div>
      </div>
      {agent.owner && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-500">by</span>
          {agent.owner.image ? (
            <img src={agent.owner.image} alt="" className="h-5 w-5 rounded-full" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-gray-700" />
          )}
          {agent.owner.handle && (
            <span className="text-xs text-gray-500">@{agent.owner.handle}</span>
          )}
        </div>
      )}
    </Link>
  );
}
