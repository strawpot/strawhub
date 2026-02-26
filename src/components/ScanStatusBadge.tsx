const configs: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Scan pending",
    className: "bg-gray-500/10 border-gray-500/30 text-gray-400",
  },
  scanning: {
    label: "Scanning\u2026",
    className: "bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse",
  },
  clean: {
    label: "No threats detected",
    className: "bg-green-500/10 border-green-500/30 text-green-400",
  },
  flagged: {
    label: "Flagged",
    className: "bg-red-500/10 border-red-500/30 text-red-400",
  },
  skipped: {
    label: "Scan skipped",
    className: "bg-gray-500/10 border-gray-500/30 text-gray-400",
  },
  error: {
    label: "Scan pending",
    className: "bg-gray-500/10 border-gray-500/30 text-gray-400",
  },
  rate_limited: {
    label: "Scan pending",
    className: "bg-gray-500/10 border-gray-500/30 text-gray-400",
  },
};

export function ScanStatusBadge({
  scanStatus,
  scanResult,
}: {
  scanStatus?: string;
  scanResult?: { positives?: number; total?: number; permalink?: string };
}) {
  if (!scanStatus) return null;

  const config = configs[scanStatus];
  if (!config) return null;

  const label =
    scanStatus === "flagged" && scanResult?.positives != null
      ? `Flagged by ${scanResult.positives}/${scanResult.total ?? "?"} engines`
      : config.label;

  const badge = (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
        />
      </svg>
      {label}
    </span>
  );

  if (scanResult?.permalink) {
    return (
      <a href={scanResult.permalink} target="_blank" rel="noopener noreferrer">
        {badge}
      </a>
    );
  }

  return badge;
}
