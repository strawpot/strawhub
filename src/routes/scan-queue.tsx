import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useSEO } from "../lib/useSEO";
import { ScanStatusBadge } from "../components/ScanStatusBadge";

export const Route = createFileRoute("/scan-queue")({
  component: ScanQueuePage,
});

function ScanQueuePage() {
  useSEO({ title: "Scan Queue - StrawHub", url: "/scan-queue", noindex: true });

  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const currentUser = useQuery(api.users.me);
  const items = useQuery(api.virusTotalScan.listPendingScans);
  const retriggerScan = useMutation(api.virusTotalScan.retriggerScan);
  const retriggerAgentScan = useMutation(api.virusTotalScan.retriggerAgentScan);
  const retriggerMemoryScan = useMutation(api.virusTotalScan.retriggerMemoryScan);

  if (isLoading) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Scan Queue</h1>
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

  if (currentUser && currentUser.role !== "admin" && currentUser.role !== "moderator") {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Scan Queue</h1>
        <p className="text-gray-400">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white">Scan Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          Skill, agent, and memory versions that need VirusTotal scanning. High priority = latest version.
        </p>
      </div>

      {items === undefined ? (
        <p className="text-gray-500 text-sm">Loading scan queue...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-sm">No pending scans.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ScanQueueCard
              key={item._id}
              item={item}
              onRetrigger={async () => {
                if (item.kind === "agent") {
                  await retriggerAgentScan({ versionId: item._id as any });
                } else if (item.kind === "memory") {
                  await retriggerMemoryScan({ versionId: item._id as any });
                } else {
                  await retriggerScan({ versionId: item._id as any });
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScanQueueCard({
  item,
  onRetrigger,
}: {
  item: {
    _id: any;
    kind: "skill" | "agent" | "memory";
    slug: string;
    displayName: string;
    version: string;
    scanStatus: string;
    scanResult?: { errorMessage?: string } | null;
    priority: "high" | "low";
    createdAt: number;
  };
  onRetrigger: () => Promise<void>;
}) {
  const [acting, setActing] = useState(false);

  const handleRetrigger = async () => {
    setActing(true);
    try {
      await onRetrigger();
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-800 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                item.priority === "high"
                  ? "bg-red-500/10 border border-red-500/30 text-red-400"
                  : "bg-gray-500/10 border border-gray-500/30 text-gray-400"
              }`}
            >
              {item.priority}
            </span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase bg-gray-700/50 text-gray-400">
              {item.kind}
            </span>
            <Link
              to={item.kind === "agent" ? "/agents/$slug" : item.kind === "memory" ? "/memories/$slug" : "/skills/$slug"}
              params={{ slug: item.slug }}
              className="text-sm font-medium text-orange-400 hover:text-orange-300 truncate"
            >
              {item.displayName}
            </Link>
            <span className="text-xs text-gray-500 font-mono">v{item.version}</span>
            <ScanStatusBadge scanStatus={item.scanStatus} />
          </div>
          <p className="text-xs text-gray-500">
            {new Date(item.createdAt).toLocaleDateString()}
          </p>
          {item.scanResult?.errorMessage && (
            <p className="text-xs text-yellow-400/70">{item.scanResult.errorMessage}</p>
          )}
        </div>

        <button
          onClick={handleRetrigger}
          disabled={acting}
          className="shrink-0 rounded bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
        >
          {acting ? "Retrying..." : "Retry Scan"}
        </button>
      </div>
    </div>
  );
}
