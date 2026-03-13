/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as apiTokens from "../apiTokens.js";
import type * as auth from "../auth.js";
import type * as comments from "../comments.js";
import type * as counters from "../counters.js";
import type * as crons from "../crons.js";
import type * as deleteAllFiles from "../deleteAllFiles.js";
import type * as downloads from "../downloads.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as httpApiV1_adminV1 from "../httpApiV1/adminV1.js";
import type * as httpApiV1_agentsV1 from "../httpApiV1/agentsV1.js";
import type * as httpApiV1_downloadsV1 from "../httpApiV1/downloadsV1.js";
import type * as httpApiV1_memoriesV1 from "../httpApiV1/memoriesV1.js";
import type * as httpApiV1_rolesV1 from "../httpApiV1/rolesV1.js";
import type * as httpApiV1_searchV1 from "../httpApiV1/searchV1.js";
import type * as httpApiV1_shared from "../httpApiV1/shared.js";
import type * as httpApiV1_skillsV1 from "../httpApiV1/skillsV1.js";
import type * as httpApiV1_starsV1 from "../httpApiV1/starsV1.js";
import type * as httpApiV1_whoamiV1 from "../httpApiV1/whoamiV1.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_binaryDetection from "../lib/binaryDetection.js";
import type * as lib_embeddings from "../lib/embeddings.js";
import type * as lib_frontmatter from "../lib/frontmatter.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_publishValidation from "../lib/publishValidation.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_textExtensions from "../lib/textExtensions.js";
import type * as lib_versionSpec from "../lib/versionSpec.js";
import type * as lib_virusTotal from "../lib/virusTotal.js";
import type * as lib_zip from "../lib/zip.js";
import type * as memories from "../memories.js";
import type * as reports from "../reports.js";
import type * as roles from "../roles.js";
import type * as search from "../search.js";
import type * as skills from "../skills.js";
import type * as stars from "../stars.js";
import type * as statEvents from "../statEvents.js";
import type * as users from "../users.js";
import type * as virusTotalScan from "../virusTotalScan.js";
import type * as virusTotalScanActions from "../virusTotalScanActions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  apiTokens: typeof apiTokens;
  auth: typeof auth;
  comments: typeof comments;
  counters: typeof counters;
  crons: typeof crons;
  deleteAllFiles: typeof deleteAllFiles;
  downloads: typeof downloads;
  files: typeof files;
  http: typeof http;
  "httpApiV1/adminV1": typeof httpApiV1_adminV1;
  "httpApiV1/agentsV1": typeof httpApiV1_agentsV1;
  "httpApiV1/downloadsV1": typeof httpApiV1_downloadsV1;
  "httpApiV1/memoriesV1": typeof httpApiV1_memoriesV1;
  "httpApiV1/rolesV1": typeof httpApiV1_rolesV1;
  "httpApiV1/searchV1": typeof httpApiV1_searchV1;
  "httpApiV1/shared": typeof httpApiV1_shared;
  "httpApiV1/skillsV1": typeof httpApiV1_skillsV1;
  "httpApiV1/starsV1": typeof httpApiV1_starsV1;
  "httpApiV1/whoamiV1": typeof httpApiV1_whoamiV1;
  "lib/access": typeof lib_access;
  "lib/binaryDetection": typeof lib_binaryDetection;
  "lib/embeddings": typeof lib_embeddings;
  "lib/frontmatter": typeof lib_frontmatter;
  "lib/pagination": typeof lib_pagination;
  "lib/publishValidation": typeof lib_publishValidation;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/textExtensions": typeof lib_textExtensions;
  "lib/versionSpec": typeof lib_versionSpec;
  "lib/virusTotal": typeof lib_virusTotal;
  "lib/zip": typeof lib_zip;
  memories: typeof memories;
  reports: typeof reports;
  roles: typeof roles;
  search: typeof search;
  skills: typeof skills;
  stars: typeof stars;
  statEvents: typeof statEvents;
  users: typeof users;
  virusTotalScan: typeof virusTotalScan;
  virusTotalScanActions: typeof virusTotalScanActions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
