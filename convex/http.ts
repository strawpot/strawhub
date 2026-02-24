import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { listSkills, getSkill, getSkillFile, publishSkill } from "./httpApiV1/skillsV1";
import { listRoles, getRole, getRoleFile, resolveRoleDeps, publishRole } from "./httpApiV1/rolesV1";
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
// Note: Convex httpRouter uses path pattern matching.
// For dynamic routes like /api/v1/skills/:slug, we use a catch-all
// and parse the slug from the URL in the handler.

// ── Roles ───────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/roles", method: "GET", handler: listRoles });
http.route({ path: "/api/v1/roles", method: "POST", handler: publishRole });
http.route({ path: "/api/v1/roles", method: "OPTIONS", handler: corsHandler });

// ── Search ──────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/search", method: "GET", handler: searchAll });

// ── Auth ────────────────────────────────────────────────────────────────────
http.route({ path: "/api/v1/whoami", method: "GET", handler: whoami });

export default http;
