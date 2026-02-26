import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useSEO } from "../lib/useSEO";

export const Route = createFileRoute("/stars")({
  component: StarsPage,
});

function StarsPage() {
  useSEO({
    title: "Stars - StrawHub",
    description: "Skills and roles you've starred on StrawHub.",
    url: "/stars",
    noindex: true,
  });

  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();

  if (isLoading) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Stars</h1>
        <div className="rounded-lg border border-gray-800 p-5 md:p-8 text-center">
          <p className="text-gray-400 mb-4">
            Sign in with GitHub to see skills and roles you've starred.
          </p>
          <button
            onClick={() => void signIn("github")}
            className="rounded bg-gray-800 px-6 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Sign in with GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold text-white">Stars</h1>
      <p className="text-gray-400">
        Skills and roles you've starred.
      </p>
      <StarredList />
    </div>
  );
}

function StarredList() {
  const starred = useQuery(api.stars.listByUser);
  const toggleStar = useMutation(api.stars.toggle);

  if (starred === undefined) {
    return <p className="text-gray-500 text-sm">Loading...</p>;
  }

  const hasSkills = starred.skills.length > 0;
  const hasRoles = starred.roles.length > 0;

  if (!hasSkills && !hasRoles) {
    return (
      <div className="rounded-lg border border-gray-800 p-6 md:p-12 text-center">
        <p className="text-lg font-medium text-gray-400 mb-2">
          No starred items yet
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Star skills and roles to keep track of them here.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            to="/skills"
            className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Browse Skills
          </Link>
          <Link
            to="/roles"
            className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            Browse Roles
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {hasSkills && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            Skills
            <span className="ml-2 font-normal text-gray-500">({starred.skills.length})</span>
          </h2>
          <div className="space-y-3">
            {starred.skills.map((s) => (
              <div
                key={s._id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-800 p-4"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to="/skills/$slug"
                    params={{ slug: s.slug }}
                    className="text-base font-medium text-white hover:text-orange-400"
                  >
                    {s.displayName}
                  </Link>
                  <p className="text-xs text-gray-500 font-mono">/{s.slug}</p>
                  {s.summary && (
                    <p className="mt-1 text-sm text-gray-400 line-clamp-2">
                      {s.summary}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    <span>{s.stats.downloads} installs</span>
                    <span>{s.stats.stars} stars</span>
                    <span>{s.stats.versions} versions</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleStar({ targetId: s._id, targetKind: "skill" })}
                  className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-sm font-medium text-yellow-400 hover:bg-yellow-500/20 transition-colors shrink-0"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                    />
                  </svg>
                  Unstar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasRoles && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">
            Roles
            <span className="ml-2 font-normal text-gray-500">({starred.roles.length})</span>
          </h2>
          <div className="space-y-3">
            {starred.roles.map((r) => (
              <div
                key={r._id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-gray-800 p-4"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to="/roles/$slug"
                    params={{ slug: r.slug }}
                    className="text-base font-medium text-white hover:text-orange-400"
                  >
                    {r.displayName}
                  </Link>
                  <p className="text-xs text-gray-500 font-mono">/{r.slug}</p>
                  {r.summary && (
                    <p className="mt-1 text-sm text-gray-400 line-clamp-2">
                      {r.summary}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    <span>{r.stats.downloads} installs</span>
                    <span>{r.stats.stars} stars</span>
                    <span>{r.stats.versions} versions</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleStar({ targetId: r._id, targetKind: "role" })}
                  className="inline-flex items-center gap-1.5 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-sm font-medium text-yellow-400 hover:bg-yellow-500/20 transition-colors shrink-0"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                    />
                  </svg>
                  Unstar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
