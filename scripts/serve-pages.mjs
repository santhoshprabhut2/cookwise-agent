#!/usr/bin/env node
/**
 * Serves ./out the way GitHub Pages does, so the Pages build can be checked
 * locally before it is pushed.
 *
 *   npm run preview:pages -- --base=/cookwise-agent
 *
 * Same behaviour as Pages: the site lives under its base path, /dir redirects to
 * /dir/ and serves dir/index.html, and an unknown URL gets 404.html with a 404.
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
// Git Bash on Windows turns "/name" into "C:/Program Files/Git/name"; keep the last segment.
const rawBase = (arg("base") ?? "").trim().replace(/[\/]+$/, "");
const base = !rawBase
  ? ""
  : /^[A-Za-z]:/.test(rawBase)
    ? `/${rawBase.split(/[\/]/).pop()}`
    : rawBase.startsWith("/")
      ? rawBase
      : `/${rawBase}`;
const port = Number(arg("port") ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();

function send(res, status, file) {
  res.writeHead(status, {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    // Pages sends a short cache lifetime; none here keeps reloads honest.
    "cache-control": "no-cache",
  });
  createReadStream(file).pipe(res);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname);

    if (base && pathname !== base && !pathname.startsWith(`${base}/`)) {
      return send(res, 404, path.join(root, "404.html"));
    }
    if (base && pathname === base) {
      res.writeHead(301, { location: `${base}/${url.search}` });
      return res.end();
    }

    const local = pathname.slice(base.length) || "/";
    const target = path.join(root, local);
    if (!target.startsWith(root)) return send(res, 404, path.join(root, "404.html"));

    if (local.endsWith("/") && isFile(path.join(target, "index.html"))) {
      return send(res, 200, path.join(target, "index.html"));
    }
    if (isFile(target)) return send(res, 200, target);
    if (isFile(path.join(target, "index.html"))) {
      res.writeHead(301, { location: `${pathname}/${url.search}` });
      return res.end();
    }
    return send(res, 404, path.join(root, "404.html"));
  })
  .listen(port, () => {
    console.log(`Serving ./out at http://localhost:${port}${base}/`);
  });
