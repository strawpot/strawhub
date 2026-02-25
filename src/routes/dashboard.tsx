import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const user = useQuery(api.users.me);

  if (isLoading) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Dashboard</h1>
        <div className="rounded-lg border border-gray-800 p-5 md:p-8 text-center">
          <p className="text-gray-400 mb-4">
            Sign in with GitHub to manage your published roles and skills.
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-white">My Content</h1>
        <Link
          to="/upload"
          className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
        >
          Publish New
        </Link>
      </div>

      {user && <UserContent userId={user._id} handle={user.handle} />}
    </div>
  );
}

function UserContent({ userId, handle }: { userId: string; handle?: string }) {
  const skills = useQuery(api.skills.listByOwner, { userId: userId as any });
  const roles = useQuery(api.roles.listByOwner, { userId: userId as any });

  const hasSkills = skills && skills.length > 0;
  const hasRoles = roles && roles.length > 0;
  const loading = skills === undefined || roles === undefined;
  const empty = !loading && !hasSkills && !hasRoles;

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading...</p>;
  }

  if (empty) {
    return (
      <div className="rounded-lg border border-gray-800 p-6 md:p-12 text-center">
        <p className="text-lg font-medium text-gray-400 mb-2">
          No content yet
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Publish your first skill or role to share it with the community.
        </p>
        <Link
          to="/upload"
          className="rounded bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-500"
        >
          Publish
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Skills */}
      {hasSkills && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Skills</h2>
          <div className="space-y-3">
            {skills.map((s) => (
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
                    <span>{s.stats.downloads} downloads</span>
                    <span>{s.stats.stars} stars</span>
                    <span>{s.stats.versions} versions</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to="/upload"
                    search={{ updateSlug: s.slug }}
                    className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                  >
                    New Version
                  </Link>
                  <Link
                    to="/skills/$slug"
                    params={{ slug: s.slug }}
                    className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Roles */}
      {hasRoles && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Roles</h2>
          <div className="space-y-3">
            {roles.map((r) => (
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
                    <span>{r.stats.downloads} downloads</span>
                    <span>{r.stats.stars} stars</span>
                    <span>{r.stats.versions} versions</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to="/upload"
                    search={{ updateSlug: r.slug, kind: "role" }}
                    className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                  >
                    New Version
                  </Link>
                  <Link
                    to="/roles/$slug"
                    params={{ slug: r.slug }}
                    className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
