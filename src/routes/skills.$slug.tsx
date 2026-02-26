import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { extractSlug } from "../lib/versionSpec";
import { parseFrontmatter } from "../lib/parseFrontmatter";
import { useSEO } from "../lib/useSEO";
import { buildJsonLd } from "../lib/buildJsonLd";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const Route = createFileRoute("/skills/$slug")({
  component: SkillDetailPage,
});

function SkillDetailPage() {
  const { slug } = Route.useParams();
  const skill = useQuery(api.skills.getBySlug, { slug });

  useSEO({
    title: skill ? `${skill.displayName} - StrawHub` : "StrawHub",
    description: skill?.summary || undefined,
    url: `/skills/${slug}`,
  });
  const versions = useQuery(
    api.skills.getVersions,
    skill ? { skillId: skill._id } : "skip",
  );
  const trackDownload = useMutation(api.downloads.trackDownload);
  const toggleStar = useMutation(api.stars.toggle);
  const currentUser = useQuery(api.users.me);
  const starred = useQuery(
    api.stars.isStarred,
    skill ? { targetId: skill._id } : "skip",
  );
  const createReport = useMutation(api.reports.create);
  const hasReported = useQuery(
    api.reports.hasReported,
    skill ? { targetId: skill._id } : "skip",
  );
  const navigate = useNavigate();
  const isOwner = !!(currentUser && skill && skill.ownerUserId === currentUser._id);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState("");

  if (skill === undefined) {
    return <p className="text-gray-400">Loading...</p>;
  }

  const jsonLd = skill
    ? buildJsonLd({
        displayName: skill.displayName,
        summary: skill.summary,
        slug: skill.slug,
        kind: "skills",
        owner: skill.owner,
      })
    : null;

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
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <Link to="/skills" className="text-sm text-gray-400 hover:text-white">
        &larr; Back to Skills
      </Link>

      {/* Header: title + version on left, download on right */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              {skill.displayName}
            </h1>
            {skill.latestVersion && (
              <span className="rounded bg-orange-500/10 border border-orange-500/30 px-2.5 py-0.5 text-sm font-semibold text-orange-400 font-mono">
                v{skill.latestVersion.version}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 font-mono mt-1">/{skill.slug}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isOwner && (
            <button
              onClick={() => navigate({ to: "/upload", search: { updateSlug: skill.slug } })}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m4-8l-4-4m0 0l-4 4m4-4v12"
                />
              </svg>
              Update
            </button>
          )}
          {skill.latestVersion && skill.zipUrl && (
            <button
              onClick={async () => {
                trackDownload({ targetKind: "skill", slug: skill.slug, version: skill.latestVersion!.version });
                const res = await fetch(skill.zipUrl!);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${skill.slug}-v${skill.latestVersion!.version}.zip`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 transition-colors"
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
      </div>

      {/* Author */}
      {skill.owner && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">by</span>
          {skill.owner.image ? (
            <img
              src={skill.owner.image}
              alt={skill.owner.displayName ?? skill.owner.handle ?? ""}
              className="h-8 w-8 rounded-full"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-gray-700" />
          )}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-200">
              {skill.owner.displayName ?? skill.owner.handle ?? "unknown"}
            </span>
            {skill.owner.handle && (
              <span className="text-gray-500">@{skill.owner.handle}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-6 text-sm text-gray-400">
        <button
          onClick={() => {
            if (currentUser) {
              toggleStar({ targetId: skill._id, targetKind: "skill" });
            }
          }}
          className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-base font-medium transition-colors ${
            starred
              ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
              : currentUser
                ? "border-gray-700 text-gray-400 hover:border-yellow-500/40 hover:text-yellow-400"
                : "border-gray-700 text-gray-400 cursor-default"
          }`}
        >
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill={starred ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
          </svg>
          {skill.stats.stars}
        </button>
        {currentUser && !isOwner && (
          <button
            onClick={() => {
              if (!hasReported) setShowReportForm(!showReportForm);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              hasReported
                ? "border-red-500/40 bg-red-500/10 text-red-400 cursor-default"
                : "border-gray-700 text-gray-400 hover:border-red-500/40 hover:text-red-400"
            }`}
            title={hasReported ? "You have reported this item" : "Report this item"}
          >
            <svg
              className="h-4 w-4"
              fill={hasReported ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5"
              />
            </svg>
            {hasReported ? "Reported" : "Report"}
          </button>
        )}
        {skill.latestVersion && (
          <span>{skill.latestVersion.downloads ?? 0} current installs</span>
        )}
        <span>{skill.stats.downloads} all-time installs</span>
        <span>{skill.stats.versions} versions</span>
      </div>

      {showReportForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowReportForm(false);
              setReportError("");
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-5 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-white">Report skill</h3>
            <p className="text-sm text-gray-400">
              Help us keep StrawHub safe. Describe what's wrong and our moderators will review it.
            </p>
            <div className="space-y-2">
              <textarea
                rows={4}
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="What should moderators know about this skill?"
                maxLength={1000}
                autoFocus
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none resize-none"
              />
              <p className="text-xs text-gray-600 text-right">{reportDescription.length}/1000</p>
            </div>
            {reportError && (
              <p className="text-sm text-red-400">{reportError}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowReportForm(false);
                  setReportError("");
                }}
                className="rounded px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setReportSubmitting(true);
                  setReportError("");
                  try {
                    await createReport({
                      targetId: skill._id,
                      targetKind: "skill",
                      description: reportDescription,
                    });
                    setShowReportForm(false);
                    setReportDescription("");
                  } catch (e: any) {
                    setReportError(e.message || "Failed to submit report.");
                  } finally {
                    setReportSubmitting(false);
                  }
                }}
                disabled={reportSubmitting || !reportDescription.trim()}
                className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {reportSubmitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {skill.summary && <p className="text-gray-300">{skill.summary}</p>}

      {/* Tabbed: Files / Versions */}
      <DetailTabs
        files={skill.filesWithUrls}
        versions={versions ?? []}
        latestVersionId={skill.latestVersionId}
        slug={skill.slug}
        targetKind="skill"
        trackDownload={trackDownload}
      />

      {/* Dependencies */}
      {skill.dependencies.skills.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400">Dependencies</h3>
          <div className="flex flex-wrap gap-2">
            {skill.dependencies.skills.map((dep: string) => (
              <Link
                key={dep}
                to="/skills/$slug"
                params={{ slug: extractSlug(dep) }}
                className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
              >
                {dep}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkillMdViewer({
  file,
}: {
  file: { path: string; size: number; url: string | null } | undefined;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!file?.url) return;
    let cancelled = false;
    fetch(file.url)
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [file?.url]);

  if (!file) return null;

  const { frontmatter, body } = content
    ? parseFrontmatter(content)
    : { frontmatter: {}, body: "" };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 text-base font-bold text-white hover:text-gray-300 transition-colors"
      >
        <svg
          className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-90"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        SKILL.md
      </button>
      {collapsed ? null : content === null ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="space-y-3">
          {Object.keys(frontmatter).length > 0 && (
            <div className="rounded-lg bg-gray-900/50 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(frontmatter).map(([key, value]) => (
                    <tr
                      key={key}
                      className="border-b border-gray-800 last:border-0"
                    >
                      <td className="px-4 py-2 text-gray-400 font-mono whitespace-nowrap align-top">
                        {key}
                      </td>
                      <td className="px-4 py-2 text-gray-200">
                        {Array.isArray(value) ? (
                          <div className="flex flex-wrap gap-1.5">
                            {value.map((v, i) => (
                              <span
                                key={i}
                                className="rounded bg-gray-800 px-2 py-0.5 text-xs font-mono text-gray-300"
                              >
                                {String(v)}
                              </span>
                            ))}
                          </div>
                        ) : typeof value === "object" && value !== null ? (
                          <pre className="text-xs font-mono text-gray-300">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          <span className="font-mono">{String(value)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {body.trim() && (
            <div className="prose prose-invert prose-sm max-w-none text-gray-300 [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_a]:text-orange-400 [&_code]:bg-gray-800 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-gray-950 [&_pre]:rounded-lg">
              <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailTabs({
  files,
  versions,
  latestVersionId,
  slug,
  targetKind,
  trackDownload,
}: {
  files: Array<{ path: string; size: number; url: string | null }>;
  versions: Array<{
    _id: string;
    version: string;
    changelog: string;
    createdAt: number;
    zipUrl: string | null;
  }>;
  latestVersionId: string | undefined;
  slug: string;
  targetKind: "skill" | "role";
  trackDownload: (args: { targetKind: "skill" | "role"; slug: string; version?: string }) => void;
}) {
  const [tab, setTab] = useState<"files" | "versions">("files");

  const skillMdFile = files.find((f) => f.path === "SKILL.md");
  const otherFiles = files.filter((f) => f.path !== "SKILL.md");

  const [selectedFile, setSelectedFile] = useState<string | null>(
    otherFiles[0]?.path ?? null,
  );
  const [fetchResult, setFetchResult] = useState<{
    url: string;
    content: string | null;
  } | null>(null);

  const selected = otherFiles.find((f) => f.path === selectedFile);
  const loading = selected?.url != null && fetchResult?.url !== selected.url;
  const displayContent =
    selected?.url && fetchResult?.url === selected.url
      ? fetchResult.content
      : null;

  useEffect(() => {
    if (!selected?.url) {
      return;
    }
    let cancelled = false;
    fetch(selected.url)
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled)
          setFetchResult({ url: selected.url!, content: text });
      })
      .catch(() => {
        if (!cancelled)
          setFetchResult({ url: selected.url!, content: null });
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.url]);

  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      {/* Tab bar */}
      <div className="flex gap-6 border-b border-gray-800 px-4 pt-3">
        <button
          onClick={() => setTab("files")}
          className={`pb-3 text-base font-semibold transition-colors ${
            tab === "files"
              ? "text-white border-b-2 border-orange-500"
              : "text-gray-500 hover:text-gray-200"
          }`}
        >
          Files
        </button>
        <button
          onClick={() => setTab("versions")}
          className={`pb-3 text-base font-semibold transition-colors ${
            tab === "versions"
              ? "text-white border-b-2 border-orange-500"
              : "text-gray-500 hover:text-gray-200"
          }`}
        >
          Versions
        </button>
      </div>

      {/* Files tab */}
      {tab === "files" && (
        <div className="p-4 space-y-4">
          {/* SKILL.md always shown at top */}
          {skillMdFile && <SkillMdViewer file={skillMdFile} />}

          {/* Other files — side-by-side: file list left, viewer right */}
          {otherFiles.length > 0 && (
            <div className="flex rounded-lg border border-gray-800 overflow-hidden min-h-[24rem]">
              {/* Left: file list */}
              <div className="w-56 shrink-0 border-r border-gray-800 bg-gray-900/50 overflow-y-auto">
                {otherFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file.path)}
                    title={file.path}
                    className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors border-l-2 ${
                      selectedFile === file.path
                        ? "text-white bg-gray-800 border-orange-500"
                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border-transparent"
                    }`}
                  >
                    <div className="truncate">{file.path}</div>
                    <div className="text-gray-600 text-[10px]">
                      {formatFileSize(file.size)}
                    </div>
                  </button>
                ))}
              </div>
              {/* Right: file content viewer */}
              <div className="flex-1 min-w-0 p-4 overflow-auto bg-gray-950">
                {loading ? (
                  <p className="text-gray-500 text-sm">Loading...</p>
                ) : displayContent !== null ? (
                  selected && isLikelyBinary(selected.path, displayContent) ? (
                    <p className="text-gray-500 text-sm">
                      Binary file not shown.
                    </p>
                  ) : (
                    <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-words">
                      {displayContent}
                    </pre>
                  )
                ) : (
                  <p className="text-gray-500 text-sm">Unable to load file.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Versions tab */}
      {tab === "versions" && versions.length > 0 && (
        <div className="p-4 divide-y divide-gray-800">
          {versions.map((ver) => (
            <div key={ver._id} className="px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold font-mono ${
                    ver._id === latestVersionId
                      ? "bg-orange-500/10 border border-orange-500/30 text-orange-400"
                      : "bg-gray-800 text-gray-400"
                  }`}
                >
                  v{ver.version}
                </span>
                {ver._id === latestVersionId && (
                  <span className="text-xs text-gray-500">latest</span>
                )}
                <span className="text-xs text-gray-500 ml-auto">
                  {new Date(ver.createdAt).toLocaleDateString()}
                </span>
                {ver.zipUrl && (
                  <button
                    onClick={async () => {
                      trackDownload({ targetKind, slug, version: ver.version });
                      const res = await fetch(ver.zipUrl!);
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${slug}-v${ver.version}.zip`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    <svg
                      className="h-3 w-3"
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
                    .zip
                  </button>
                )}
              </div>
              {ver.changelog && (
                <p className="text-sm text-gray-300">{ver.changelog}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".html", ".css",
  ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".sh", ".bash", ".zsh",
  ".env", ".gitignore", ".editorconfig", ".prettierrc", ".eslintrc",
  ".cfg", ".ini", ".conf", ".csv", ".svg", ".lock", ".log",
]);

function isLikelyBinary(path: string, content: string): boolean {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return false;
  // Check for null bytes or Unicode replacement characters typical of binary-as-text
  return /\0/.test(content) || (content.length > 0 && (content.match(/\uFFFD/g)?.length ?? 0) / content.length > 0.01);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
