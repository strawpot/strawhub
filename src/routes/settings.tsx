import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { useSEO } from "../lib/useSEO";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  useSEO({
    title: "Settings - StrawHub",
    url: "/settings",
    noindex: true,
  });

  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const user = useQuery(api.users.me);

  if (isLoading) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>
        <div className="rounded-lg border border-gray-800 p-5 md:p-8 text-center">
          <p className="text-gray-400 mb-4">
            Sign in with GitHub to manage your account settings.
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
    <div className="space-y-8">
      <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>

      {/* Profile card */}
      {user && (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center rounded-lg border border-gray-800 bg-gray-900/50 p-5">
          {user.image ? (
            <img
              src={user.image}
              alt=""
              className="h-[72px] w-[72px] rounded-lg border-2 border-orange-600/30"
            />
          ) : (
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-lg border-2 border-orange-600/30 bg-gray-800 text-2xl font-bold text-gray-400">
              {(user.displayName || user.name || "U").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-lg font-semibold text-white">
              {user.displayName || user.name || "User"}
            </p>
            {user.handle && (
              <p className="text-sm text-gray-400">@{user.handle}</p>
            )}
            {user.email && (
              <p className="text-sm text-gray-500">{user.email}</p>
            )}
          </div>
        </div>
      )}

      {/* Profile settings */}
      {user && <ProfileForm user={user} />}

      {/* API tokens */}
      <ApiTokensSection />

      {/* Danger zone */}
      <DangerZone />
    </div>
  );
}

function ProfileForm({ user }: { user: any }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const [displayName, setDisplayName] = useState(user.displayName || user.name || "");
  const [bio, setBio] = useState(user.bio || "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setStatus("");
    try {
      await updateProfile({ displayName, bio });
      setStatus("Saved.");
      setTimeout(() => setStatus(""), 3000);
    } catch (e: any) {
      setStatus(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-gray-800 p-5">
      <h2 className="text-xl font-semibold text-white">Profile</h2>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Bio</label>
        <textarea
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell people what you're building."
          className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {status && (
          <span className="text-sm text-gray-400">{status}</span>
        )}
      </div>
    </section>
  );
}

function ApiTokensSection() {
  const tokens = useQuery(api.apiTokens.list);
  const createToken = useMutation(api.apiTokens.create);
  const revokeToken = useMutation(api.apiTokens.revoke);

  const [newTokenName, setNewTokenName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createToken({ name: newTokenName || "Unnamed token" });
      setCreatedToken(result.token);
      setNewTokenName("");
      setCopied(false);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (createdToken) {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    await revokeToken({ tokenId: tokenId as any });
  };

  const activeTokens = tokens?.filter((t) => !t.revokedAt) ?? [];
  const revokedTokens = tokens?.filter((t) => t.revokedAt) ?? [];

  return (
    <section className="space-y-4 rounded-lg border border-gray-800 p-5">
      <h2 className="text-xl font-semibold text-white">API Tokens</h2>
      <p className="text-sm text-gray-400">
        Use these tokens for CLI access. Tokens are shown once on creation.
      </p>

      {/* Create token */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={newTokenName}
          onChange={(e) => setNewTokenName(e.target.value)}
          placeholder="Token label (e.g. my-laptop)"
          className="flex-1 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreate();
          }}
        />
        <button
          onClick={() => void handleCreate()}
          disabled={creating}
          className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create token"}
        </button>
      </div>

      {/* Newly created token (show once) */}
      {createdToken && (
        <div className="rounded-lg border border-orange-600/50 bg-orange-950/30 p-4 space-y-2">
          <p className="text-sm font-medium text-orange-400">
            Token created! Copy it now — you won't be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-gray-900 px-3 py-2 text-sm text-green-400 font-mono break-all">
              {createdToken}
            </code>
            <button
              onClick={() => void handleCopy()}
              className="rounded bg-gray-800 px-3 py-2 text-sm text-white hover:bg-gray-700 shrink-0"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setCreatedToken(null)}
            className="text-xs text-gray-500 hover:text-gray-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Token list */}
      {tokens === undefined ? (
        <p className="text-gray-500 text-sm">Loading tokens...</p>
      ) : activeTokens.length === 0 && !createdToken ? (
        <p className="text-gray-500 text-sm">No tokens yet.</p>
      ) : (
        <div className="space-y-2">
          {activeTokens.map((t) => (
            <div
              key={t._id}
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded border border-gray-800 p-3"
            >
              <div>
                <p className="text-sm font-medium text-white">{t.name}</p>
                <p className="text-xs text-gray-500 font-mono">
                  {t.tokenPrefix}
                </p>
                <p className="text-xs text-gray-600">
                  Created {new Date(t.createdAt).toLocaleDateString()}
                  {t.lastUsedAt &&
                    ` · Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`}
                </p>
              </div>
              <button
                onClick={() => void handleRevoke(t._id)}
                className="rounded border border-red-800 px-3 py-1 text-xs text-red-400 hover:bg-red-950"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Revoked tokens */}
      {revokedTokens.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-400">
            {revokedTokens.length} revoked token{revokedTokens.length > 1 ? "s" : ""}
          </summary>
          <div className="mt-2 space-y-2">
            {revokedTokens.map((t) => (
              <div
                key={t._id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded border border-gray-800/50 p-3 opacity-50"
              >
                <div>
                  <p className="text-sm text-gray-400 line-through">{t.name}</p>
                  <p className="text-xs text-gray-600 font-mono">
                    {t.tokenPrefix}
                  </p>
                </div>
                <span className="text-xs text-red-600">Revoked</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function DangerZone() {
  const deleteAccount = useMutation(api.users.deleteAccount);
  const { signOut } = useAuthActions();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      await signOut();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-red-900/50 bg-red-950/10 p-5">
      <h2 className="text-xl font-semibold text-red-400">Danger zone</h2>
      <p className="text-sm text-gray-400">
        Delete your account permanently. This cannot be undone. Published skills
        remain public.
      </p>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="rounded border border-red-800 bg-red-950/50 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/50"
        >
          Delete account
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Yes, delete my account"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
