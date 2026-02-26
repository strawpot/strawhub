import { useState, useRef, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSEO } from "../lib/useSEO";

export const Route = createFileRoute("/skills/")({
  component: SkillsPage,
});

const PAGE_SIZE = 20;

function SkillsPage() {
  useSEO({
    title: "Skills - StrawHub",
    description: "Browse reusable skill modules for StrawPot agents.",
    url: "/skills",
  });

  const [filter, setFilter] = useState("");
  const trimmed = filter.trim();

  const results = useQuery(api.skills.list, {
    query: trimmed || undefined,
  });
  const { isAuthenticated } = useConvexAuth();
  const starredIds = useQuery(api.stars.listStarredIds) ?? [];
  const toggleStar = useMutation(api.stars.toggle);

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
        <h1 className="text-2xl md:text-3xl font-bold text-white">
          Skills
          {results !== undefined && (
            <span className="ml-2 font-normal text-gray-500">({results.length})</span>
          )}
        </h1>
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

      {results === undefined ? (
        <div className="text-gray-500">Loading...</div>
      ) : results.length === 0 ? (
        <div className="text-gray-500">
          {trimmed ? "No skills match your filter." : "No skills published yet."}
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleResults?.map((skill) => (
            <SkillCard
              key={skill._id}
              skill={skill}
              starred={starredIds.includes(skill._id)}
              isAuthenticated={isAuthenticated}
              onToggleStar={() => toggleStar({ targetId: skill._id, targetKind: "skill" })}
            />
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

function SkillCard({
  skill,
  starred,
  isAuthenticated,
  onToggleStar,
}: {
  skill: any;
  starred: boolean;
  isAuthenticated: boolean;
  onToggleStar: () => void;
}) {
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
        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
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
            {skill.stats.stars}
          </button>
          <span>{skill.stats.downloads} installs</span>
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
