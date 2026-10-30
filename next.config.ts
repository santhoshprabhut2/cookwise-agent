import type { NextConfig } from "next";

/**
 * Two ways to build:
 *
 * - `next build` is the normal server build (Vercel, `next start`).
 * - `npm run build:pages` sets NEXT_PUBLIC_STATIC_EXPORT=true and produces a
 *   plain-files site in `out/` for GitHub Pages. Pages serves a project under
 *   its repository name, so NEXT_PUBLIC_BASE_PATH is that name (`/cookwise-agent`).
 *   See docs/PAGES.md.
 */
const staticExport = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Lets several `next dev` instances run side by side during parallel agent
  // work (COOKWISE_DIST_DIR=.next-agent-x npx next dev -p 31xx). Unset in normal use.
  distDir: process.env.COOKWISE_DIST_DIR || ".next",

  ...(staticExport
    ? {
        output: "export",
        // `/home/index.html`, because Pages serves folders, not extensionless files.
        trailingSlash: true,
        basePath: basePath || undefined,
        // The default image loader needs a server. The app uses emoji tiles.
        images: { unoptimized: true },
      }
    : {
        // A static host cannot set headers, so these only exist on a server build.
        async headers() {
          return [
            {
              // The service worker must never be served from cache, or a stale
              // worker keeps controlling the app after a deploy. Service-Worker-Allowed
              // lets it claim the whole origin even though it lives in /public.
              source: "/sw.js",
              headers: [
                { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
                { key: "Service-Worker-Allowed", value: "/" },
              ],
            },
            {
              source: "/manifest.webmanifest",
              headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
            },
            {
              source: "/icons/:path*",
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=604800, stale-while-revalidate=86400",
                },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
