import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/roles")({
  component: RolesPage,
});

function RolesPage() {
  const roles = useQuery(api.roles.list, { limit: 50 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Roles</h1>
        <Link
          to="/upload"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Publish Role
        </Link>
      </div>

      <p className="text-gray-400">
        Agent behavior definitions with dependent skills that are resolved
        recursively on install.
      </p>

      {roles === undefined ? (
        <div className="text-gray-500">Loading...</div>
      ) : roles.length === 0 ? (
        <div className="text-gray-500">No roles published yet.</div>
      ) : (
        <div className="grid gap-4">
          {roles.map((role) => (
            <RoleCard key={role._id} role={role} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoleCard({ role }: { role: any }) {
  return (
    <Link
      to={`/roles/${role.slug}`}
      className="block rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{role.displayName}</h3>
          <p className="text-sm text-gray-400 mt-1">{role.summary}</p>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>{role.stats.downloads} downloads</span>
          <span>{role.stats.stars} stars</span>
        </div>
      </div>
    </Link>
  );
}
