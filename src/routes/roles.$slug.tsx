import { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/roles/$slug")({
  component: RoleDetailPage,
});

function RoleDetailPage() {
  const { slug } = Route.useParams();
  const role = useQuery(api.roles.getBySlug, { slug });
  const trackDownload = useMutation(api.downloads.trackDownload);

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

      {/* Header: title + version on left, download on right */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">
              {role.displayName}
            </h1>
            {role.latestVersion && (
              <span className="rounded bg-orange-500/10 border border-orange-500/30 px-2.5 py-0.5 text-sm font-semibold text-orange-400 font-mono">
                v{role.latestVersion.version}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 font-mono mt-1">/{role.slug}</p>
        </div>

        {role.latestVersion && role.zipUrl && (
          <button
            onClick={async () => {
              trackDownload({ targetKind: "role", slug: role.slug });
              const res = await fetch(role.zipUrl!);
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${role.slug}-v${role.latestVersion!.version}.zip`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 transition-colors shrink-0"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download .zip
          </button>
        )}
      </div>

      {/* Author */}
      {role.owner && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">by</span>
          {role.owner.image ? (
            <img
              src={role.owner.image}
              alt={role.owner.displayName ?? role.owner.handle ?? ""}
              className="h-8 w-8 rounded-full"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-gray-700" />
          )}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-200">
              {role.owner.displayName ?? role.owner.handle ?? "unknown"}
            </span>
            {role.owner.handle && (
              <span className="text-gray-500">@{role.owner.handle}</span>
            )}
          </div>
        </div>
      )}

      {role.summary && <p className="text-gray-300">{role.summary}</p>}

      <div className="flex gap-6 text-sm text-gray-400">
        <span>{role.stats.downloads} downloads</span>
        <span>{role.stats.stars} stars</span>
        <span>{role.stats.versions} versions</span>
      </div>

      {/* Changelog */}
      {role.latestVersion?.changelog && (
        <div className="rounded-lg border border-gray-800 p-4 space-y-2">
          <h3 className="text-sm font-medium text-gray-400">Changelog</h3>
          <p className="text-sm text-gray-300">
            {role.latestVersion.changelog}
          </p>
          <span className="text-xs text-gray-500">
            {new Date(role.latestVersion.createdAt).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* File viewer */}
      {role.filesWithUrls.length > 0 && (
        <FileViewer files={role.filesWithUrls} />
      )}

      {/* Skill Dependencies */}
      {role.dependencies.skills.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400">
            Skill Dependencies
          </h3>
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

      {/* Role Dependencies */}
      {role.dependencies.roles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400">
            Role Dependencies
          </h3>
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

function FileViewer({
  files,
}: {
  files: Array<{ path: string; size: number; url: string | null }>;
}) {
  const [selectedFile, setSelectedFile] = useState<string | null>(
    files[0]?.path ?? null,
  );
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected = files.find((f) => f.path === selectedFile);

  useEffect(() => {
    if (!selected?.url) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(selected.url)
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.url]);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-400">Files</h3>
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        {/* File tabs */}
        <div className="flex border-b border-gray-800 bg-gray-900/50 overflow-x-auto">
          {files.map((file) => (
            <button
              key={file.path}
              onClick={() => setSelectedFile(file.path)}
              className={`px-4 py-2 text-xs font-mono whitespace-nowrap transition-colors ${
                selectedFile === file.path
                  ? "text-white bg-gray-800 border-b-2 border-orange-500"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              }`}
            >
              {file.path}
              <span className="ml-2 text-gray-600">
                {formatFileSize(file.size)}
              </span>
            </button>
          ))}
        </div>

        {/* File content */}
        <div className="p-4 max-h-96 overflow-auto bg-gray-950">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : content !== null ? (
            <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-words">
              {content}
            </pre>
          ) : (
            <p className="text-gray-500 text-sm">Unable to load file.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
