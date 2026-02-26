import { describe, it, expect } from "vitest";
import {
  jsonResponse,
  errorResponse,
  extractBearerToken,
  getSearchParams,
  getClientIp,
  hashToken,
  corsResponse,
} from "./shared";

describe("jsonResponse", () => {
  it("returns 200 by default", () => {
    const resp = jsonResponse({ ok: true });
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("application/json");
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("uses custom status code", () => {
    const resp = jsonResponse({ created: true }, 201);
    expect(resp.status).toBe(201);
  });

  it("serializes body as JSON", async () => {
    const resp = jsonResponse({ key: "value" });
    const body = await resp.json();
    expect(body).toEqual({ key: "value" });
  });
});

describe("errorResponse", () => {
  it("returns 400 by default", async () => {
    const resp = errorResponse("bad request");
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body).toEqual({ error: "bad request" });
  });

  it("uses custom status code", () => {
    const resp = errorResponse("not found", 404);
    expect(resp.status).toBe(404);
  });
});

describe("extractBearerToken", () => {
  it("extracts token from valid Authorization header", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer abc123" },
    });
    expect(extractBearerToken(request)).toBe("abc123");
  });

  it("returns null when no Authorization header", () => {
    const request = new Request("https://example.com");
    expect(extractBearerToken(request)).toBeNull();
  });

  it("returns null for non-Bearer auth", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Basic abc123" },
    });
    expect(extractBearerToken(request)).toBeNull();
  });

  it("handles token with special characters", () => {
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer sh_a1b2c3-d4e5_f6" },
    });
    expect(extractBearerToken(request)).toBe("sh_a1b2c3-d4e5_f6");
  });
});

describe("getSearchParams", () => {
  it("extracts query params from request URL", () => {
    const request = new Request("https://example.com/api?q=test&limit=10");
    const params = getSearchParams(request);
    expect(params.get("q")).toBe("test");
    expect(params.get("limit")).toBe("10");
  });

  it("returns empty params for URL without query string", () => {
    const request = new Request("https://example.com/api");
    const params = getSearchParams(request);
    expect(params.toString()).toBe("");
  });
});

describe("getClientIp", () => {
  it("extracts from x-forwarded-for (first IP)", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("extracts single x-forwarded-for IP", () => {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(getClientIp(request)).toBe("10.0.0.1");
  });

  it("falls back to x-real-ip", () => {
    const request = new Request("https://example.com", {
      headers: { "x-real-ip": "192.168.1.1" },
    });
    expect(getClientIp(request)).toBe("192.168.1.1");
  });

  it("returns 'unknown' when no IP headers", () => {
    const request = new Request("https://example.com");
    expect(getClientIp(request)).toBe("unknown");
  });
});

describe("hashToken", () => {
  it("returns hex-encoded SHA-256 hash", async () => {
    const hash = await hashToken("test-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces consistent results", async () => {
    const hash1 = await hashToken("same-input");
    const hash2 = await hashToken("same-input");
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", async () => {
    const hash1 = await hashToken("token-a");
    const hash2 = await hashToken("token-b");
    expect(hash1).not.toBe(hash2);
  });
});

describe("corsResponse", () => {
  it("returns null body with CORS headers", () => {
    const resp = corsResponse();
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(resp.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST, OPTIONS",
    );
    expect(resp.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization",
    );
  });
});
