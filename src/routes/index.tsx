import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="space-y-12">
      <section className="text-center py-8 md:py-16">
        <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">StrawHub</h1>
        <p className="text-lg md:text-xl text-gray-400 mb-8">
          The role and skill registry for{" "}
          <span className="text-orange-400">StrawPot</span>
        </p>
        <p className="text-gray-500 max-w-2xl mx-auto">
          Discover, share, and install reusable roles and skills for your
          StrawPot agents. Roles define agent behavior with dependent skills
          that are resolved recursively on install.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Link
          to="/roles"
          className="block rounded-lg border border-gray-800 p-5 md:p-8 hover:border-orange-400/50 transition-colors"
        >
          <h2 className="text-2xl font-bold text-white mb-2">Roles</h2>
          <p className="text-gray-400">
            Agent behavior definitions with default tools, model config, and
            skill dependencies. Install a role and all its skills come with it.
          </p>
        </Link>

        <Link
          to="/skills"
          className="block rounded-lg border border-gray-800 p-5 md:p-8 hover:border-orange-400/50 transition-colors"
        >
          <h2 className="text-2xl font-bold text-white mb-2">Skills</h2>
          <p className="text-gray-400">
            Markdown instruction modules that agents load into context. Skills
            can depend on other skills for recursive resolution.
          </p>
        </Link>
      </section>

      <section className="text-center py-8">
        <h3 className="text-lg font-semibold text-gray-300 mb-4">
          Quick Install
        </h3>
        <code className="rounded bg-gray-900 px-6 py-3 text-sm text-orange-400 inline-block max-w-full overflow-x-auto">
          strawhub install implementer
        </code>
        <p className="text-gray-500 text-sm mt-2">
          Installs the role + all dependent skills recursively
        </p>
      </section>
    </div>
  );
}
