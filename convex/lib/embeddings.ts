/**
 * Generate text embeddings using OpenAI's text-embedding-3-small model.
 * Falls back to zero vector if OPENAI_API_KEY is not set.
 */

const EMBEDDING_MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;
const MAX_RETRIES = 3;

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, returning zero embedding");
    return new Array(DIMENSIONS).fill(0);
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
        }),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2 ** attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    }
  }

  return new Array(DIMENSIONS).fill(0);
}

/**
 * Build a text blob for embedding from skill/role metadata.
 */
export function buildEmbeddingText(opts: {
  name: string;
  displayName: string;
  summary?: string;
  description?: string;
  tags?: string[];
}): string {
  const parts = [opts.name, opts.displayName];
  if (opts.summary) parts.push(opts.summary);
  if (opts.description) parts.push(opts.description);
  if (opts.tags?.length) parts.push(opts.tags.join(" "));
  return parts.join(" ");
}
