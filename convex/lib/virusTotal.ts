/**
 * VirusTotal API client for file scanning.
 * Follows the same pattern as embeddings.ts (fetch + process.env + retry).
 */

const VT_API_BASE = "https://www.virustotal.com/api/v3";
const MAX_RETRIES = 3;

export class VTRateLimitError extends Error {
  constructor() {
    super("VirusTotal API rate limit exceeded");
    this.name = "VTRateLimitError";
  }
}

export interface VTSubmitResult {
  analysisId: string;
}

export interface VTAnalysisResult {
  status: "queued" | "completed";
  stats?: {
    malicious: number;
    suspicious: number;
    undetected: number;
    harmless: number;
    timeout: number;
    failure: number;
    "type-unsupported": number;
  };
  permalink?: string;
}

/**
 * Submit a file to VirusTotal for scanning.
 * Throws if VIRUSTOTAL_API_KEY is not set or submission fails after retries.
 */
export async function submitFileToVT(
  fileBlob: Blob,
  fileName: string,
): Promise<VTSubmitResult> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) {
    throw new Error("VIRUSTOTAL_API_KEY not set");
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const formData = new FormData();
    formData.append("file", fileBlob, fileName);

    const response = await fetch(`${VT_API_BASE}/files`, {
      method: "POST",
      headers: { "x-apikey": apiKey },
      body: formData,
    });

    if (response.status === 429) {
      const delay = 2 ** attempt * 15_000;
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`VT submit error: ${response.status} ${text}`);
    }

    const data = await response.json();
    return { analysisId: data.data.id };
  }

  throw new VTRateLimitError();
}

/**
 * Get the analysis result from VirusTotal.
 * Returns status "queued" if still processing (caller should reschedule).
 */
export async function getVTAnalysis(
  analysisId: string,
): Promise<VTAnalysisResult> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) {
    throw new Error("VIRUSTOTAL_API_KEY not set");
  }

  const response = await fetch(`${VT_API_BASE}/analyses/${analysisId}`, {
    headers: { "x-apikey": apiKey },
  });

  if (response.status === 429) {
    return { status: "queued" };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`VT analysis error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const attrs = data.data.attributes;

  if (attrs.status === "queued" || attrs.status === "in-progress") {
    return { status: "queued" };
  }

  return {
    status: "completed",
    stats: attrs.stats,
    permalink:
      attrs.permalink ??
      `https://www.virustotal.com/gui/file-analysis/${analysisId}`,
  };
}
