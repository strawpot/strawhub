import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { useSEO } from "../lib/useSEO";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

type Status = "pending" | "resolved" | "dismissed";

function ReportsPage() {
  useSEO({ title: "Reports - StrawHub", url: "/reports", noindex: true });

  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const currentUser = useQuery(api.users.me);
  const [tab, setTab] = useState<Status>("pending");
  const reports = useQuery(api.reports.list, { status: tab });
  const resolveReport = useMutation(api.reports.resolve);

  if (isLoading) {
    return <p className="text-gray-400">Loading...</p>;
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Reports</h1>
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
        <h1 className="text-2xl md:text-3xl font-bold text-white">Reports</h1>
        <p className="text-gray-400">You do not have permission to view this page.</p>
      </div>
    );
  }

  const tabs: { key: Status; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "resolved", label: "Resolved" },
    { key: "dismissed", label: "Dismissed" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold text-white">Reports</h1>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 text-sm font-semibold transition-colors ${
              tab === t.key
                ? "text-white border-b-2 border-orange-500"
                : "text-gray-500 hover:text-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Report list */}
      {reports === undefined ? (
        <p className="text-gray-500 text-sm">Loading reports...</p>
      ) : reports.length === 0 ? (
        <p className="text-gray-500 text-sm">No {tab} reports.</p>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportCard
              key={report._id}
              report={report}
              onResolve={async (resolution) => {
                await resolveReport({
                  reportId: report._id,
                  resolution,
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({
  report,
  onResolve,
}: {
  report: {
    _id: any;
    targetKind: "skill" | "role";
    targetName: string;
    targetSlug: string | null;
    description: string;
    status: string;
    reporter: { handle?: string; displayName?: string } | null;
    createdAt: number;
  };
  onResolve: (resolution: "pending" | "resolved" | "dismissed") => Promise<void>;
}) {
  const [acting, setActing] = useState(false);

  const handleAction = async (resolution: "resolved" | "dismissed") => {
    setActing(true);
    try {
      await onResolve(resolution);
    } finally {
      setActing(false);
    }
  };

  const targetUrl =
    report.targetSlug
      ? report.targetKind === "skill"
        ? `/skills/${report.targetSlug}`
        : `/roles/${report.targetSlug}`
      : null;

  return (
    <div className="rounded-lg border border-gray-800 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-400 uppercase">
              {report.targetKind}
            </span>
            {targetUrl ? (
              <Link
                to={targetUrl}
                className="text-sm font-medium text-orange-400 hover:text-orange-300 truncate"
              >
                {report.targetName}
              </Link>
            ) : (
              <span className="text-sm font-medium text-gray-300 truncate">
                {report.targetName}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Reported by{" "}
            <span className="text-gray-400">
              {report.reporter?.displayName || report.reporter?.handle || "Unknown user"}
            </span>
            {" on "}
            {new Date(report.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-300 whitespace-pre-wrap">{report.description}</p>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {report.status === "pending" && (
          <>
            <button
              onClick={() => handleAction("resolved")}
              disabled={acting}
              className="rounded bg-green-800 px-3 py-1.5 text-xs font-medium text-green-200 hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Mark Resolved
            </button>
            <button
              onClick={() => handleAction("dismissed")}
              disabled={acting}
              className="rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              Dismiss
            </button>
          </>
        )}
        {(report.status === "resolved" || report.status === "dismissed") && (
          <button
            onClick={() => handleAction("pending")}
            disabled={acting}
            className="rounded bg-gray-800 px-3 py-1.5 text-xs font-medium text-orange-400 hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
