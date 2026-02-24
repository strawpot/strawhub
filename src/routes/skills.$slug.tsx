import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/skills/$slug")({
  component: SkillDetailPage,
});

function SkillDetailPage() {
  const { slug } = Route.useParams();
  const skill = useQuery(api.skills.getBySlug, { slug });

  if (skill === undefined) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (skill === null) {
    return (
      <div className="space-y-4">
        <Link to="/skills" className="text-sm text-gray-400 hover:text-white">
          &larr; Back to Skills
        </Link>
        <p className="text-gray-400">Skill not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/skills" className="text-sm text-gray-400 hover:text-white">
        &larr; Back to Skills
      </Link>

      <div>
        <h1 className="text-3xl font-bold text-white">{skill.displayName}</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">/{skill.slug}</p>
      </div>

      {skill.summary && (
        <p className="text-gray-300">{skill.summary}</p>
      )}

      <div className="flex gap-6 text-sm text-gray-400">
        <span>{skill.stats.downloads} downloads</span>
        <span>{skill.stats.stars} stars</span>
        <span>{skill.stats.versions} versions</span>
      </div>

      {skill.owner && (
        <p className="text-sm text-gray-500">
          by {skill.owner.displayName ?? skill.owner.handle ?? "unknown"}
        </p>
      )}

      {skill.latestVersion && (
        <div className="rounded-lg border border-gray-800 p-4 space-y-2">
          <h2 className="text-lg font-semibold text-white">
            v{skill.latestVersion.version}
          </h2>
          <p className="text-sm text-gray-400">
            {skill.latestVersion.changelog}
          </p>
        </div>
      )}

      {skill.dependencies.skills.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400">Dependencies</h3>
          <div className="flex flex-wrap gap-2">
            {skill.dependencies.skills.map((dep: string) => (
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
