import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/roles/")({
  component: RolesPage,
});

function RolesPage() {
  const roles = useQuery(api.roles.list, { limit: 50 });
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!roles) return undefined;
    if (!filter.trim()) return roles;
    const q = filter.toLowerCase();
    return roles.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q),
    );
  }, [roles, filter]);

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

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, slug, or summary..."
        className="w-full rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-gray-600 focus:outline-none"
      />

      {filtered === undefined ? (
        <div className="text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500">
          {filter ? "No roles match your filter." : "No roles published yet."}
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((role) => (
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
      to="/roles/$slug"
      params={{ slug: role.slug }}
      className="block rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{role.displayName}</h3>
            <span className="text-sm text-gray-500 font-mono">/{role.slug}</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">{role.summary}</p>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
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
