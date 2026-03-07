import { createFileRoute, Link } from "@tanstack/react-router";
import { useSEO } from "../lib/useSEO";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  useSEO({
    title: "StrawHub - The Registry for StrawPot",
    url: "/",
  });

  return (
    <div className="space-y-12">
      <section className="text-center py-8 md:py-16">
        <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">StrawHub</h1>
        <p className="text-lg md:text-xl text-gray-400 mb-4">
          The registry for{" "}
          <span className="text-orange-400">StrawPot</span> — where AI agents
          get the job done
        </p>
        <p className="text-gray-500 max-w-2xl mx-auto">
          Install roles like Implementer, Reviewer, or Analyst. StrawPot
          automatically resolves the skills needed for the job.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <Link
          to="/roles"
          className="block rounded-lg border border-orange-400/30 bg-orange-400/5 p-5 md:p-8 hover:border-orange-400/50 transition-colors"
        >
          <h2 className="text-2xl font-bold text-white mb-2">Roles</h2>
          <p className="text-gray-400">
            Job definitions that bundle the skills needed for the work. Install
            a role and every dependency resolves automatically.
          </p>
        </Link>

        <Link
          to="/skills"
          className="block rounded-lg border border-gray-800 p-5 md:p-8 hover:border-gray-600 transition-colors"
        >
          <h2 className="text-2xl font-bold text-white mb-2">Skills</h2>
          <p className="text-gray-400">
            Atomic capabilities like writing code, running tests, or searching
            documents. Installed automatically with roles.
          </p>
        </Link>

        <Link
          to="/agents"
          className="block rounded-lg border border-gray-800 p-5 md:p-8 hover:border-gray-600 transition-colors"
        >
          <h2 className="text-2xl font-bold text-white mb-2">Agents</h2>
          <p className="text-gray-400">
            CLI runtimes that execute roles. Each agent bridges StrawPot to a
            specific AI platform like Claude Code, ChatGPT, or Gemini.
          </p>
        </Link>

        <Link
          to="/memories"
          className="block rounded-lg border border-gray-800 p-5 md:p-8 hover:border-gray-600 transition-colors"
        >
          <h2 className="text-2xl font-bold text-white mb-2">Memories</h2>
          <p className="text-gray-400">
            Persistent memory banks that store knowledge, context, and learned
            patterns across agent sessions.
          </p>
        </Link>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8">
        <div>
          <h3 className="text-lg font-semibold text-gray-300 mb-4">
            Example Workers
          </h3>
          <div className="space-y-3">
            {[
              ["implementer", "Write code to implement features and fix bugs"],
              ["reviewer", "Review pull requests and suggest improvements"],
              ["analyst", "Research information and produce structured reports"],
              ["support-agent", "Triage issues and respond to user questions"],
              ["product-manager", "Define requirements and prioritize work"],
            ].map(([name, desc]) => (
              <div key={name} className="flex gap-3 items-baseline">
                <code className="text-orange-400 text-sm shrink-0">{name}</code>
                <span className="text-gray-500 text-sm">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-300 mb-4">
            What a Role Bundles
          </h3>
          <pre className="text-sm text-gray-400 leading-relaxed"><code>{`role: analyst
 ├─ skills
 │   ├─ web-search
 │   ├─ summarize-documents
 │   ├─ extract-data
 │   └─ report-writing
 └─ default_agent
     └─ claude_code`}</code></pre>
          <p className="text-gray-500 text-sm mt-3">
            One install resolves everything.
          </p>
        </div>
      </section>

      <section className="text-center py-8">
        <h3 className="text-lg font-semibold text-gray-300 mb-4">
          Get Started
        </h3>
        <code className="rounded bg-gray-900 px-6 py-3 text-sm text-orange-400 inline-block max-w-full overflow-x-auto">
          strawhub install role implementer
        </code>
        <p className="text-gray-500 text-sm mt-2">
          One command installs the role and every skill it needs
        </p>
      </section>

      <section className="text-center py-8 border-t border-gray-800">
        <h3 className="text-lg font-semibold text-gray-300 mb-2">
          Publish Your Workers
        </h3>
        <p className="text-gray-500 max-w-lg mx-auto mb-4">
          Built a role? Publish it to the registry and let others install it
          in one command.
        </p>
        <code className="rounded bg-gray-900 px-6 py-3 text-sm text-orange-400 inline-block max-w-full overflow-x-auto mb-4">
          strawhub publish role analyst
        </code>
        <div>
          <Link
            to="/upload"
            search={{ kind: "role" }}
            className="inline-block rounded bg-orange-500 px-6 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            Publish a Role
          </Link>
        </div>
      </section>
    </div>
  );
}
