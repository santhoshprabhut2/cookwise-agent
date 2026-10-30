#!/usr/bin/env node
/**
 * Builds the GitHub Pages site into ./out.
 *
 *   npm run build:pages                       base path from GITHUB_REPOSITORY, else "/"
 *   npm run build:pages -- --base=/cookwise-agent
 *
 * GitHub Pages serves plain files, so the app is exported as a static site. A
 * static export cannot contain API routes, the proxy or the auth callback, so
 * the build runs on a throwaway copy of the source (./.pages) without them.
 * Your real source is never touched. The app falls back to its built-in
 * engines wherever it would have called an API route (see src/lib/ai/client.ts).
 *
 * The result is the same app: installable, offline-first, all data in the
 * browser. See docs/PAGES.md.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(root, ".pages");
const out = path.join(root, "out");

/** What the static build needs. Anything else at the repo root is ignored. */
const COPY = ["src", "public", "package.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs"];

/** Code that needs a server. Left out of the copy. */
const SERVER_ONLY = ["src/app/api", "src/app/auth/callback", "src/proxy.ts"];

function basePath() {
  const flag = process.argv.find((a) => a.startsWith("--base="));
  if (flag) return flag.slice("--base=".length);
  if (process.env.NEXT_PUBLIC_BASE_PATH !== undefined) return process.env.NEXT_PUBLIC_BASE_PATH;
  const repo = (process.env.GITHUB_REPOSITORY ?? "").split("/")[1];
  // A user site (<name>.github.io) is served from the root, a project site from /<repo>.
  if (!repo || repo.toLowerCase().endsWith(".github.io")) return "";
  return `/${repo}`;
}

/**
 * "/name", "name" or "" are fine. Git Bash on Windows rewrites a leading "/name"
 * argument into "C:/Program Files/Git/name", so a drive path is cut back to its
 * last segment.
 */
function normalise(value) {
  const v = value.trim().replace(/[\/]+$/, "");
  if (!v) return "";
  if (/^[A-Za-z]:/.test(v)) return `/${v.split(/[\/]/).pop()}`;
  return v.startsWith("/") ? v : `/${v}`;
}

const base = normalise(basePath());
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

console.log(`Building for GitHub Pages at "${base || "/"}"`);

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

for (const name of COPY) {
  if (!existsSync(path.join(root, name))) continue;
  cpSync(path.join(root, name), path.join(work, name), {
    recursive: true,
    filter: (src) => {
      const r = rel(src);
      if (SERVER_ONLY.includes(r)) return false;
      if (/(^|\/)__tests__(\/|$)/.test(r) || /\.(test|spec)\.[tj]sx?$/.test(r)) return false;
      return true;
    },
  });
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: work,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_STATIC_EXPORT: "true",
    NEXT_PUBLIC_BASE_PATH: base,
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
if (result.status !== 0) {
  console.error("\nThe Pages build failed. The log above has the reason.");
  process.exit(result.status ?? 1);
}

const built = path.join(work, "out");
if (!existsSync(path.join(built, "index.html"))) {
  console.error("The build finished but produced no out/index.html.");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
renameSync(built, out);
// Pages must not run Jekyll over the output, which would drop the _next folder.
writeFileSync(path.join(out, ".nojekyll"), "");
rmSync(work, { recursive: true, force: true });

/**
 * Give the service worker the list of every built script, style and font, so the
 * whole app can be cached on the first visit. The list is also hashed into a
 * build id, so each deploy gets fresh caches and the old ones are deleted.
 */
function listFiles(dir, prefix) {
  const found = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}/${e.name}`;
    if (e.isDirectory()) found.push(...listFiles(path.join(dir, e.name), rel));
    else found.push(rel);
  }
  return found.sort();
}

const assets = listFiles(path.join(out, "_next", "static"), "/_next/static");
const swPath = path.join(out, "sw.js");
let sw = readFileSync(swPath, "utf8");
const buildId = createHash("sha1").update(assets.join("\n")).digest("hex").slice(0, 10);
if (!sw.includes("/*BUILD_ASSETS*/") || !sw.includes('const BUILD_ID = "dev";')) {
  console.error("public/sw.js is missing its BUILD_ID or BUILD_ASSETS placeholder.");
  process.exit(1);
}
sw = sw
  .replace("/*BUILD_ASSETS*/", assets.map((a) => JSON.stringify(a)).join(", "))
  .replace('const BUILD_ID = "dev";', `const BUILD_ID = "${buildId}";`);
writeFileSync(swPath, sw);
console.log(`Service worker will precache ${assets.length} build files (build ${buildId}).`);

const pages = (function count(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? count(path.join(dir, e.name)) : e.name.endsWith(".html") ? 1 : 0;
  }
  return n;
})(out);
console.log(`\nDone: ${pages} pages in ./out. Try it with: npm run preview:pages${base ? ` -- --base=${base}` : ""}`);
