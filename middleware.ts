import { rewrite } from "@vercel/functions";

const PRODUCTION_CONVEX_SITE_URL = "https://descriptive-crab-211.convex.site";

export default function middleware(request: Request) {
  const convexSiteUrl =
    process.env.VITE_CONVEX_SITE_URL || PRODUCTION_CONVEX_SITE_URL;

  const url = new URL(request.url);
  const destination = new URL(
    `${url.pathname}${url.search}`,
    convexSiteUrl,
  );

  return rewrite(destination);
}

export const config = {
  matcher: "/api/v1/:path*",
};
