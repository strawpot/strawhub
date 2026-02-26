import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { listSkills, handleGetSkill, handleGetSkillFile, publishSkill, handleDeleteSkill } from "./httpApiV1/skillsV1";
import { listRoles, handleGetRole, handleGetRoleFile, handleResolveRoleDeps, publishRole, handleDeleteRole } from "./httpApiV1/rolesV1";
import { searchAll } from "./httpApiV1/searchV1";
import { whoami } from "./httpApiV1/whoamiV1";
import { serveSitemap } from "./httpApiV1/sitemapV1";
import { toggleStar } from "./httpApiV1/starsV1";
import { setUserRole, banUser } from "./httpApiV1/adminV1";
import { corsResponse } from "./httpApiV1/shared";

const http = httpRouter();

// ── Auth (Convex Auth handles OAuth callbacks) ──────────────────────────────
auth.addHttpRoutes(http);

// ── CORS preflight ──────────────────────────────────────────────────────────
const corsHandler = httpAction(async () => corsResponse());

// ── Skills ──────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/skills", method: "GET", handler: listSkills });
http.route({ path: "/api/v1/skills", method: "POST", handler: publishSkill });
http.route({ path: "/api/v1/skills", method: "OPTIONS", handler: corsHandler });

// Dynamic slug routes: /api/v1/skills/:slug and /api/v1/skills/:slug/file
const skillSlugDispatcher = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname.split("/");
  if (parts[5] === "file") return handleGetSkillFile(ctx, request);
  return handleGetSkill(ctx, request);
});
const skillSlugDeleteDispatcher = httpAction(async (ctx, request) => {
  return handleDeleteSkill(ctx, request);
});
http.route({ pathPrefix: "/api/v1/skills/", method: "GET", handler: skillSlugDispatcher });
http.route({ pathPrefix: "/api/v1/skills/", method: "DELETE", handler: skillSlugDeleteDispatcher });
http.route({ pathPrefix: "/api/v1/skills/", method: "OPTIONS", handler: corsHandler });

// ── Roles ───────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/roles", method: "GET", handler: listRoles });
http.route({ path: "/api/v1/roles", method: "POST", handler: publishRole });
http.route({ path: "/api/v1/roles", method: "OPTIONS", handler: corsHandler });

// Dynamic slug routes: /api/v1/roles/:slug, /:slug/file, /:slug/resolve
const roleSlugDispatcher = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname.split("/");
  if (parts[5] === "file") return handleGetRoleFile(ctx, request);
  if (parts[5] === "resolve") return handleResolveRoleDeps(ctx, request);
  return handleGetRole(ctx, request);
});
const roleSlugDeleteDispatcher = httpAction(async (ctx, request) => {
  return handleDeleteRole(ctx, request);
});
http.route({ pathPrefix: "/api/v1/roles/", method: "GET", handler: roleSlugDispatcher });
http.route({ pathPrefix: "/api/v1/roles/", method: "DELETE", handler: roleSlugDeleteDispatcher });
http.route({ pathPrefix: "/api/v1/roles/", method: "OPTIONS", handler: corsHandler });

// ── Stars ───────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/stars/toggle", method: "POST", handler: toggleStar });
http.route({ path: "/api/v1/stars/toggle", method: "OPTIONS", handler: corsHandler });

// ── Search ──────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/search", method: "GET", handler: searchAll });

// ── Auth ────────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/whoami", method: "GET", handler: whoami });

// ── Admin ───────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/admin/set-role", method: "POST", handler: setUserRole });
http.route({ path: "/api/v1/admin/set-role", method: "OPTIONS", handler: corsHandler });
http.route({ path: "/api/v1/admin/ban-user", method: "POST", handler: banUser });
http.route({ path: "/api/v1/admin/ban-user", method: "OPTIONS", handler: corsHandler });

// ── Sitemap ─────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/sitemap", method: "GET", handler: serveSitemap });

export default http;
