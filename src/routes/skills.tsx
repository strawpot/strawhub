import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/skills")({
  component: SkillsPage,
});

function SkillsPage() {
  const skills = useQuery(api.skills.list, { limit: 50 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Skills</h1>
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

      {skills === undefined ? (
        <div className="text-gray-500">Loading...</div>
      ) : skills.length === 0 ? (
        <div className="text-gray-500">No skills published yet.</div>
      ) : (
        <div className="grid gap-4">
          {skills.map((skill) => (
            <SkillCard key={skill._id} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillCard({ skill }: { skill: any }) {
  return (
    <Link
      to={`/skills/${skill.slug}`}
      className="block rounded-lg border border-gray-800 p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">{skill.displayName}</h3>
          <p className="text-sm text-gray-400 mt-1">{skill.summary}</p>
        </div>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>{skill.stats.downloads} downloads</span>
          <span>{skill.stats.stars} stars</span>
        </div>
      </div>
    </Link>
  );
}
