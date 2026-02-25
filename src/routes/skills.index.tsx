import { useState, useRef, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/skills/")({
  component: SkillsPage,
});

function SkillsPage() {
  const [filter, setFilter] = useState("");
  const trimmed = filter.trim();

  const { results, status, loadMore } = usePaginatedQuery(
    api.skills.list,
    { query: trimmed || undefined },
    { initialNumItems: 20 },
  );

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && status === "CanLoadMore") {
          loadMore(20);
        }
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, loadMore]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Skills</h1>
        <Link
          to="/upload"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Publish Skill
        </Link>
      </div>

      <p className="text-gray-400">
        Markdown instruction modules that agents load into context.
      </p>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, slug, or summary..."
        className="w-full rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-gray-600 focus:outline-none"
      />

      {status === "LoadingFirstPage" ? (
        <div className="text-gray-500">Loading...</div>
      ) : results.length === 0 ? (
        <div className="text-gray-500">
          {trimmed ? "No skills match your filter." : "No skills published yet."}
        </div>
      ) : (
        <div className="grid gap-4">
          {results.map((skill) => (
            <SkillCard key={skill._id} skill={skill} />
          ))}
          <div ref={sentinelRef} />
          {status === "LoadingMore" && (
            <div className="text-center text-gray-500 text-sm py-2">Loading more...</div>
          )}
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill }: { skill: any }) {
  return (
    <Link
      to="/skills/$slug"
      params={{ slug: skill.slug }}
      className="block rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{skill.displayName}</h3>
            <span className="text-sm text-gray-500 font-mono">/{skill.slug}</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">{skill.summary}</p>
        </div>
        <div className="flex gap-4 text-xs text-gray-500 shrink-0">
          <span>{skill.stats.downloads} downloads</span>
          <span>{skill.stats.stars} stars</span>
        </div>
      </div>
      {skill.owner && (
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-500">by</span>
          {skill.owner.image ? (
            <img src={skill.owner.image} alt="" className="h-5 w-5 rounded-full" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-gray-700" />
          )}
          {skill.owner.handle && (
            <span className="text-xs text-gray-500">@{skill.owner.handle}</span>
          )}
        </div>
      )}
    </Link>
  );
}
