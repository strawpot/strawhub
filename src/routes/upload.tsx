import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState, useRef, useCallback } from "react";
import { api } from "../../convex/_generated/api";
import { parseFrontmatter } from "../lib/parseFrontmatter";
import { splitDependencies } from "../lib/versionSpec";
import { sha256Hex } from "../lib/hash";
import { fetchFromGitHub } from "../lib/githubImport";

type UploadSearch = { mode?: "import"; updateSlug?: string };

export const Route = createFileRoute("/upload")({
  validateSearch: (search: Record<string, unknown>): UploadSearch => ({
    mode: search.mode === "import" ? "import" : undefined,
    updateSlug: typeof search.updateSlug === "string" ? search.updateSlug : undefined,
  }),
  component: UploadPage,
});

interface UploadFile {
  file: File;
  path: string;
  status: "pending" | "uploading" | "done" | "error";
  storageId?: string;
  sha256?: string;
}

function UploadPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const { mode } = Route.useSearch();

  const [kind, setKind] = useState<"skill" | "role">("skill");
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [changelog, setChangelog] = useState("");
  const [skillDeps, setSkillDeps] = useState("");
  const [roleDeps, setRoleDeps] = useState("");
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState("");

  // GitHub import state
  const [githubUrl, setGithubUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [showImport, setShowImport] = useState(mode === "import");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const publishSkill = useMutation(api.skills.publish);
  const publishRole = useMutation(api.roles.publish);

  const processFiles = useCallback(
    (newFiles: File[]) => {
      const uploadFiles: UploadFile[] = newFiles.map((f) => ({
        file: f,
        path: f.name,
        status: "pending" as const,
      }));
      setFiles(uploadFiles);

      // Auto-detect kind and parse frontmatter
      const skillMd = newFiles.find((f) => f.name === "SKILL.md");
      const roleMd = newFiles.find((f) => f.name === "ROLE.md");

      if (roleMd) {
        setKind("role");
        roleMd.text().then((text) => {
          const { frontmatter } = parseFrontmatter(text);
          if (frontmatter.name && typeof frontmatter.name === "string") {
            setSlug(frontmatter.name);
            setDisplayName(
              typeof frontmatter.description === "string"
                ? frontmatter.description
                : frontmatter.name,
            );
          }
          if (frontmatter.version) setVersion(String(frontmatter.version));
          if (Array.isArray(frontmatter.dependencies)) {
            const split = splitDependencies(frontmatter.dependencies as string[]);
            setSkillDeps((split.skills ?? []).join(", "));
            setRoleDeps((split.roles ?? []).join(", "));
          }
        });
      } else if (skillMd) {
        setKind("skill");
        skillMd.text().then((text) => {
          const { frontmatter } = parseFrontmatter(text);
          if (frontmatter.name && typeof frontmatter.name === "string") {
            setSlug(frontmatter.name);
            setDisplayName(
              typeof frontmatter.description === "string"
                ? frontmatter.description
                : frontmatter.name,
            );
          }
          if (frontmatter.version) setVersion(String(frontmatter.version));
          if (Array.isArray(frontmatter.dependencies)) {
            const deps = (frontmatter.dependencies as string[])
              .map((d) => d.trim())
              .filter((d) => d && !d.startsWith("role:"));
            setSkillDeps(deps.join(", "));
            setRoleDeps("");
          }
        });
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) processFiles(droppedFiles);
    },
    [processFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      if (selected.length > 0) processFiles(selected);
    },
    [processFiles],
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGitHubImport = async () => {
    if (!githubUrl.trim()) return;
    setIsFetching(true);
    setError(null);
    try {
      const ghFiles = await fetchFromGitHub(githubUrl.trim());
      if (ghFiles.length === 0) {
        setError("No files found at that URL.");
        return;
      }
      const fileObjects = ghFiles.map(
        (f) => new File([f.content], f.path, { type: "text/plain" }),
      );
      processFiles(fileObjects);
      setShowImport(false);
      setGithubUrl("");
    } catch (e: any) {
      setError(e.message || "Failed to fetch from GitHub");
    } finally {
      setIsFetching(false);
    }
  };

  const handlePublish = async () => {
    if (!slug.trim() || !displayName.trim() || files.length === 0) {
      setError("Slug, display name, and at least one file are required.");
      return;
    }

    const primaryFile = kind === "skill" ? "SKILL.md" : "ROLE.md";
    if (!files.some((f) => f.path === primaryFile)) {
      setError(`A ${primaryFile} file is required.`);
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      // Upload each file to Convex storage
      const uploadedFiles: Array<{
        path: string;
        size: number;
        storageId: string;
        sha256: string;
        contentType?: string;
      }> = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress(`Uploading file ${i + 1} of ${files.length}...`);

        setFiles((prev) =>
          prev.map((pf, j) => (j === i ? { ...pf, status: "uploading" } : pf)),
        );

        const uploadUrl = await generateUploadUrl();

        const resp = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": f.file.type || "application/octet-stream" },
          body: f.file,
        });
        if (!resp.ok) throw new Error(`Failed to upload ${f.path}`);

        const { storageId } = await resp.json();
        const hash = await sha256Hex(f.file);

        uploadedFiles.push({
          path: f.path,
          size: f.file.size,
          storageId,
          sha256: hash,
          contentType: f.file.type || undefined,
        });

        setFiles((prev) =>
          prev.map((pf, j) =>
            j === i ? { ...pf, status: "done", storageId, sha256: hash } : pf,
          ),
        );
      }

      setUploadProgress("Publishing...");

      const skills = skillDeps.split(",").map((s) => s.trim()).filter(Boolean);

      if (kind === "skill") {
        const deps = skills.length ? { skills } : undefined;
        await publishSkill({
          slug: slug.trim(),
          displayName: displayName.trim(),
          version: version.trim(),
          changelog: changelog.trim(),
          files: uploadedFiles as any,
          dependencies: deps,
        });
      } else {
        const roles = roleDeps.split(",").map((s) => s.trim()).filter(Boolean);
        const deps = (skills.length || roles.length)
          ? {
              ...(skills.length ? { skills } : {}),
              ...(roles.length ? { roles } : {}),
            }
          : undefined;
        await publishRole({
          slug: slug.trim(),
          displayName: displayName.trim(),
          version: version.trim(),
          changelog: changelog.trim(),
          files: uploadedFiles as any,
          dependencies: deps,
        });
      }

      navigate({ to: kind === "skill" ? "/skills" : "/roles" });
    } catch (e: any) {
      setError(e.message || "Publish failed");
      setFiles((prev) =>
        prev.map((f) => (f.status === "uploading" ? { ...f, status: "error" } : f)),
      );
    } finally {
      setIsPublishing(false);
      setUploadProgress("");
    }
  };

  if (isLoading) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6 max-w-2xl">
        <h1 className="text-3xl font-bold text-white">Publish</h1>
        <div className="rounded-lg border border-gray-800 p-8 text-center">
          <p className="text-gray-400 mb-4">
            Sign in with GitHub to publish roles and skills.
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
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold text-white">Publish</h1>

      {/* GitHub Import */}
      <div className="rounded-lg border border-gray-800">
        <button
          onClick={() => setShowImport(!showImport)}
          className="w-full px-4 py-3 text-left text-sm font-medium text-gray-300 hover:text-white flex items-center justify-between"
        >
          <span>Import from GitHub</span>
          <span className="text-gray-500">{showImport ? "−" : "+"}</span>
        </button>
        {showImport && (
          <div className="px-4 pb-4 space-y-3">
            <p className="text-xs text-gray-500">
              Paste a GitHub URL to import files. Supports repo URLs, directory
              paths, and raw file links.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                placeholder="https://github.com/user/repo/tree/main/skills/my-skill"
                className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
              />
              <button
                onClick={handleGitHubImport}
                disabled={isFetching || !githubUrl.trim()}
                className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {isFetching ? "Fetching..." : "Fetch"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Kind Toggle */}
        <div className="flex gap-4">
          <button
            onClick={() => setKind("skill")}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              kind === "skill"
                ? "bg-orange-500 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Skill
          </button>
          <button
            onClick={() => setKind("role")}
            className={`rounded px-4 py-2 text-sm font-medium transition-colors ${
              kind === "role"
                ? "bg-orange-500 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            Role
          </button>
        </div>

        {/* File Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded border border-dashed border-gray-700 p-8 text-center hover:border-gray-500 transition-colors"
        >
          {files.length === 0 ? (
            <p className="text-gray-400 text-sm">
              Drop your {kind === "skill" ? "SKILL.md" : "ROLE.md"} and
              supporting files here, or click to browse.
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-300">{f.path}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs">
                      {(f.file.size / 1024).toFixed(1)} KB
                    </span>
                    {f.status === "done" && (
                      <span className="text-green-400 text-xs">uploaded</span>
                    )}
                    {f.status === "uploading" && (
                      <span className="text-orange-400 text-xs">
                        uploading...
                      </span>
                    )}
                    {f.status === "error" && (
                      <span className="text-red-400 text-xs">error</span>
                    )}
                    {!isPublishing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="text-gray-500 hover:text-red-400 text-xs"
                      >
                        remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <p className="text-gray-500 text-xs mt-2">
                Click or drop more files to replace.
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Form Fields */}
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-gray-400">Slug</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-skill"
              className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-400">Display Name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Skill"
              className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-400">Version</span>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-400">Changelog</span>
            <textarea
              value={changelog}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder="What's new in this version..."
              rows={3}
              className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm text-gray-400">
              Skill Dependencies (comma-separated, e.g. slug&gt;=1.0.0)
            </span>
            <input
              type="text"
              value={skillDeps}
              onChange={(e) => setSkillDeps(e.target.value)}
              placeholder="git-workflow>=1.0.0, code-review, python-testing^2.0.0"
              className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
            />
          </label>

          {kind === "role" && (
            <label className="block">
              <span className="text-sm text-gray-400">
                Role Dependencies (comma-separated, e.g. slug&gt;=1.0.0)
              </span>
              <input
                type="text"
                value={roleDeps}
                onChange={(e) => setRoleDeps(e.target.value)}
                placeholder="implementer>=1.0.0, reviewer"
                className="mt-1 block w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white placeholder-gray-500 focus:border-orange-400 focus:outline-none"
              />
            </label>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Progress */}
        {uploadProgress && (
          <p className="text-sm text-orange-400">{uploadProgress}</p>
        )}

        {/* Publish Button */}
        <button
          onClick={handlePublish}
          disabled={isPublishing || files.length === 0}
          className="w-full rounded bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPublishing
            ? "Publishing..."
            : `Publish ${kind === "skill" ? "Skill" : "Role"}`}
        </button>
      </div>
    </div>
  );
}
