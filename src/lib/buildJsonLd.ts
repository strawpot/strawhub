export const BASE_URL = "https://strawhub.dev";

export interface JsonLdInput {
  displayName: string;
  summary?: string | null;
  slug: string;
  /** "skills" or "roles" */
  kind: "skills" | "roles";
  owner?: {
    displayName?: string | null;
    handle?: string | null;
  } | null;
}

/**
 * Build a Schema.org SoftwareSourceCode JSON-LD object
 * for a skill or role detail page.
 */
export function buildJsonLd(input: JsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: input.displayName,
    description: input.summary || undefined,
    url: `${BASE_URL}/${input.kind}/${input.slug}`,
    codeRepository: `${BASE_URL}/${input.kind}/${input.slug}`,
    ...(input.owner && {
      author: {
        "@type": "Person",
        name: input.owner.displayName ?? input.owner.handle ?? "unknown",
      },
    }),
  };
}
