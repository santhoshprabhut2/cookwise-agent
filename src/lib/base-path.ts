/**
 * Where the app is served from.
 *
 * On a normal server the app lives at the root. On GitHub Pages a project site
 * lives under its repository name (`/cookwise-agent`), and the pages are plain
 * files, so each route is a folder (`/home/`). Next prefixes its own links and
 * assets with the base path, but anything written by hand (the service worker,
 * the manifest, icon URLs) has to do it itself, and this is the one place that
 * knows how.
 *
 * Both values are set at build time (`NEXT_PUBLIC_*` is inlined), so they are
 * constants in the browser.
 */

/** Sub-path without a trailing slash, e.g. `/cookwise-agent`. Empty at the root. */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/** True for the GitHub Pages build: no API routes, pages served as folders. */
export const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

/** A file or asset URL under the base path: `/icons/a.png` -> `/cookwise-agent/icons/a.png`. */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

/** A page URL as the host serves it: with a trailing slash on a static export. */
export function pagePath(path: string): string {
  const full = withBasePath(path);
  return STATIC_EXPORT && !full.endsWith("/") ? `${full}/` : full;
}
