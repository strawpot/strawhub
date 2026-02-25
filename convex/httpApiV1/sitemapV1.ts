import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";

const BASE_URL = "https://strawhub.dev";

/**
 * GET /api/v1/sitemap — returns a full XML sitemap.
 */
export const serveSitemap = httpAction(async (ctx) => {
  const { skills, roles } = await ctx.runQuery(api.sitemap.listAllSlugs);

  const staticPages = [
    { loc: "/", priority: "1.0", changefreq: "daily" },
    { loc: "/skills", priority: "0.8", changefreq: "daily" },
    { loc: "/roles", priority: "0.8", changefreq: "daily" },
    { loc: "/search", priority: "0.6", changefreq: "weekly" },
    { loc: "/upload", priority: "0.4", changefreq: "monthly" },
  ];

  const urls = staticPages.map(
    (p) =>
      `  <url>
    <loc>${BASE_URL}${p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
  );

  for (const skill of skills) {
    urls.push(
      `  <url>
    <loc>${BASE_URL}/skills/${skill.slug}</loc>
    <lastmod>${new Date(skill.updatedAt).toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
    );
  }

  for (const role of roles) {
    urls.push(
      `  <url>
    <loc>${BASE_URL}/roles/${role.slug}</loc>
    <lastmod>${new Date(role.updatedAt).toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
