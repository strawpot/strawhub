import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useSEO } from "../lib/useSEO";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

type Role = "admin" | "moderator" | "user";

const PAGE_SIZE = 20;

function UsersPage() {
  useSEO({ title: "Users - StrawHub", url: "/users", noindex: true });

  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const currentUser = useQuery(api.users.me);
  const [search, setSearch] = useState("");

  const { results, status, loadMore } = usePaginatedQuery(
    api.users.list,
    currentUser?.role === "admin" ? { search: search || undefined } : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  const setRole = useMutation(api.users.setRole);
  const setBlocked = useMutation(api.users.setBlocked);

  if (isLoading) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Users</h1>
        <div className="rounded-lg border border-gray-800 p-5 md:p-8 text-center">
          <p className="text-gray-400 mb-4">Sign in to access this page.</p>
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

  if (currentUser && currentUser.role !== "admin") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Users</h1>
        <p className="text-gray-400">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold text-white">Users</h1>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name, handle, or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-gray-800 bg-gray-900 px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-gray-600 focus:outline-none"
      />

      {status === "LoadingFirstPage" ? (
        <p className="text-gray-500 text-sm">Loading users...</p>
      ) : results.length === 0 ? (
        <p className="text-gray-500 text-sm">
          {search ? "No users match your search." : "No users found."}
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {results.map((user) => (
              <UserRow
                key={user._id}
                user={user}
                isCurrentUser={user._id === currentUser?._id}
                onSetRole={async (role: Role) => {
                  await setRole({ userId: user._id, role });
                }}
                onSetBlocked={async (blocked: boolean) => {
                  await setBlocked({ userId: user._id, blocked });
                }}
              />
            ))}
          </div>

          {/* Load more */}
          {status === "CanLoadMore" && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => loadMore(PAGE_SIZE)}
                className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Load more
              </button>
            </div>
          )}
          {status === "LoadingMore" && (
            <p className="text-center text-gray-500 text-sm pt-2">Loading more...</p>
          )}
        </>
      )}
    </div>
  );
}

function UserRow({
  user,
  isCurrentUser,
  onSetRole,
  onSetBlocked,
}: {
  user: {
    _id: Id<"users">;
    name?: string;
    handle?: string;
    displayName?: string;
    email?: string;
    image?: string;
    role?: string;
    deactivatedAt?: number;
    banReason?: string;
  };
  isCurrentUser: boolean;
  onSetRole: (role: Role) => Promise<void>;
  onSetBlocked: (blocked: boolean) => Promise<void>;
}) {
  const [acting, setActing] = useState(false);
  const isBlocked = !!user.deactivatedAt;
  const currentRole = (user.role || "user") as Role;

  const handleRoleChange = async (role: Role) => {
    setActing(true);
    try {
      await onSetRole(role);
    } finally {
      setActing(false);
    }
  };

  const handleBlockToggle = async () => {
    setActing(true);
    try {
      await onSetBlocked(!isBlocked);
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 p-4 flex items-center gap-4 flex-wrap">
      {/* Avatar + info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {user.image ? (
          <img src={user.image} alt="" className="h-9 w-9 rounded-full shrink-0" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-700 text-sm font-bold shrink-0">
            {(user.name || "U").charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white truncate">
              {user.displayName || user.name || "Unknown"}
            </span>
            {user.handle && (
              <span className="text-xs text-gray-500">@{user.handle}</span>
            )}
            {isCurrentUser && (
              <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">you</span>
            )}
          </div>
          {user.email && (
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
          )}
        </div>
      </div>

      {/* Status badges */}
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            currentRole === "admin"
              ? "bg-orange-900/50 text-orange-400"
              : currentRole === "moderator"
                ? "bg-blue-900/50 text-blue-400"
                : "bg-gray-800 text-gray-400"
          }`}
        >
          {currentRole}
        </span>
        {isBlocked && (
          <span className="rounded bg-red-900/50 px-2 py-0.5 text-xs font-medium text-red-400">
            blocked
          </span>
        )}
      </div>

      {/* Actions */}
      {!isCurrentUser && (
        <div className="flex items-center gap-2">
          <select
            value={currentRole}
            onChange={(e) => handleRoleChange(e.target.value as Role)}
            disabled={acting}
            className="rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-xs text-gray-300 disabled:opacity-50"
          >
            <option value="user">user</option>
            <option value="moderator">moderator</option>
            <option value="admin">admin</option>
          </select>
          <button
            onClick={handleBlockToggle}
            disabled={acting}
            className={`rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors ${
              isBlocked
                ? "bg-gray-800 text-green-400 hover:bg-gray-700"
                : "bg-gray-800 text-red-400 hover:bg-gray-700"
            }`}
          >
            {isBlocked ? "Unblock" : "Block"}
          </button>
        </div>
      )}
    </div>
  );
}
