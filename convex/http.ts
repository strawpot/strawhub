import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { listSkills, handleGetSkill, handleGetSkillFile, publishSkill } from "./httpApiV1/skillsV1";
import { listRoles, handleGetRole, handleGetRoleFile, handleResolveRoleDeps, publishRole } from "./httpApiV1/rolesV1";
import { searchAll } from "./httpApiV1/searchV1";
import { whoami } from "./httpApiV1/whoamiV1";
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
http.route({ pathPrefix: "/api/v1/skills/", method: "GET", handler: skillSlugDispatcher });
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
http.route({ pathPrefix: "/api/v1/roles/", method: "GET", handler: roleSlugDispatcher });
http.route({ pathPrefix: "/api/v1/roles/", method: "OPTIONS", handler: corsHandler });

// ── Search ──────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/search", method: "GET", handler: searchAll });

// ── Auth ────────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/whoami", method: "GET", handler: whoami });

export default http;
