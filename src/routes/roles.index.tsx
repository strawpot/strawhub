import { useState, useRef, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/roles/")({
  component: RolesPage,
});

const PAGE_SIZE = 20;

function RolesPage() {
  const [filter, setFilter] = useState("");
  const trimmed = filter.trim();

  const results = useQuery(api.roles.list, {
    query: trimmed || undefined,
  });

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [prevFilter, setPrevFilter] = useState(trimmed);
  if (prevFilter !== trimmed) {
    setPrevFilter(trimmed);
    setVisibleCount(PAGE_SIZE);
  }

  const visibleResults = results?.slice(0, visibleCount);
  const canLoadMore = results !== undefined && visibleCount < results.length;

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Roles</h1>
        <Link
          to="/upload"
          search={{ kind: "role" }}
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Publish Role
        </Link>
      </div>

      <p className="text-gray-400">
        Agent behavior definitions with dependent skills that are resolved
        recursively on install.
      </p>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, slug, or summary..."
        className="w-full rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-gray-600 focus:outline-none"
      />

      {results === undefined ? (
        <div className="text-gray-500">Loading...</div>
      ) : results.length === 0 ? (
        <div className="text-gray-500">
          {trimmed ? "No roles match your filter." : "No roles published yet."}
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleResults?.map((role) => (
            <RoleCard key={role._id} role={role} />
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

function RoleCard({ role }: { role: any }) {
  return (
    <Link
      to="/roles/$slug"
      params={{ slug: role.slug }}
      className="block rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{role.displayName}</h3>
            <span className="text-sm text-gray-500 font-mono">/{role.slug}</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">{role.summary}</p>
        </div>
        <div className="flex gap-4 text-xs text-gray-500 shrink-0">
          <span>{role.stats.downloads} downloads</span>
          <span>{role.stats.stars} stars</span>
        </div>
      </div>
      {role.owner && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-500">by</span>
          {role.owner.image ? (
            <img src={role.owner.image} alt="" className="h-5 w-5 rounded-full" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-gray-700" />
          )}
          {role.owner.handle && (
            <span className="text-xs text-gray-500">@{role.owner.handle}</span>
          )}
        </div>
      )}
    </Link>
  );
}
