import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/roles/$slug")({
  component: RoleDetailPage,
});

function RoleDetailPage() {
  const { slug } = Route.useParams();
  const role = useQuery(api.roles.getBySlug, { slug });

  if (role === undefined) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (role === null) {
    return (
      <div className="space-y-4">
        <Link to="/roles" className="text-sm text-gray-400 hover:text-white">
          &larr; Back to Roles
        </Link>
        <p className="text-gray-400">Role not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/roles" className="text-sm text-gray-400 hover:text-white">
        &larr; Back to Roles
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-white">{role.displayName}</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">/{role.slug}</p>
      </div>

      {role.summary && (
        <p className="text-gray-300">{role.summary}</p>
      )}

      <div className="flex gap-6 text-sm text-gray-400">
        <span>{role.stats.downloads} downloads</span>
        <span>{role.stats.stars} stars</span>
        <span>{role.stats.versions} versions</span>
      </div>

      {role.owner && (
        <p className="text-sm text-gray-500">
          by {role.owner.displayName ?? role.owner.handle ?? "unknown"}
        </p>
      )}

      {role.latestVersion && (
        <div className="rounded-lg border border-gray-800 p-4 space-y-2">
          <h2 className="text-lg font-semibold text-white">
            v{role.latestVersion.version}
          </h2>
          <p className="text-sm text-gray-400">
            {role.latestVersion.changelog}
          </p>
        </div>
      )}

      {role.dependencies.skills.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400">Skill Dependencies</h3>
          <div className="flex flex-wrap gap-2">
            {role.dependencies.skills.map((dep: string) => (
              <span
                key={dep}
                className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300"
              >
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}

      {role.dependencies.roles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400">Role Dependencies</h3>
          <div className="flex flex-wrap gap-2">
            {role.dependencies.roles.map((dep: string) => (
              <span
                key={dep}
                className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300"
              >
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
