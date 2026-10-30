# Deploying to GitHub Pages

Cookwise is published as a static site on GitHub Pages. It is the same app, installable and
offline-first, because every plan, pantry item and cooking record already lives in the browser
(IndexedDB). A static host is enough.

For this repository the site is at **https://santhoshprabhut2.github.io/cookwise-agent/**.

## One-time setup

1. Push the code to `main`.
2. On GitHub open **Settings → Pages**. Under *Build and deployment*, set **Source** to
   **GitHub Actions**.
3. Open the **Actions** tab. The *Deploy to GitHub Pages* workflow runs on every push to `main`
   (or press *Run workflow*). When it finishes, the link appears under Settings → Pages.

The workflow (`.github/workflows/pages.yml`) installs dependencies, type-checks, lints, runs the
tests, builds the site and publishes it. A failing test stops the deploy.

## Building and trying it locally

```bash
npm run build:pages -- --base=cookwise-agent
npm run preview:pages -- --base=cookwise-agent
```

Open http://localhost:4173/cookwise-agent/. The preview server behaves like Pages: the site lives
under its repository name, `/plan` redirects to `/plan/`, and an unknown address gets `404.html`.
`--base` is the repository name. Leave it off for a site served from the root.

## How it differs from the server build

| | Server build (`npm run build`) | Pages build (`npm run build:pages`) |
|---|---|---|
| Address | `/` | `/cookwise-agent/` (the repository name) |
| Pages | rendered on request | plain files, one folder per route (`/home/index.html`) |
| `/api/ai/*`, `/api/ml/*`, `/auth/callback`, proxy | available | **left out**; a static host cannot run them |
| Meal plans, scanning, retention | Gemini or the Python service when configured, else local | always the built-in local engines |
| Headers | set in `next.config.ts` | cannot be set; not needed |

The Pages build runs on a throwaway copy of the source (`.pages/`, ignored by git) without the
server-only files, so the real source is never changed. `src/lib/base-path.ts` holds the base path
and `STATIC_EXPORT` flag; `src/lib/ai/client.ts` returns its fallback at once when there is no
server, which is the same path the app already takes offline or without an API key.

## Why ids are in the query string

Cooking sessions and custom foods are created in the browser, so their ids do not exist when the
site is built, and Pages can only serve pages that were built. Screens that act on one record are
therefore one page that reads `?id=`:

| Screen | Address |
|---|---|
| Recipe detail | `/recipes/view?id=<recipe id>` |
| Cooking mode | `/cook/session?id=<session id>` |
| Nutrient retention | `/cook/session/retention?id=<session id>` |
| Feedback | `/cook/session/feedback?id=<session id>` |
| Edit a custom food | `/foods/edit?id=<food id>` |

Build these addresses with `src/lib/routes.ts`, never by hand.

## Installing and offline

Pages is served over HTTPS, so Chrome and Edge offer **Install** and iPhone and iPad use
**Share → Add to Home Screen**. The service worker (`public/sw.js`) is registered with the scope
`/cookwise-agent/`. When the Pages build runs, `scripts/build-pages.mjs` writes the list of every
built script, style and font into the worker, so the whole app is cached on the first visit and
works with no network. Each deploy gets a new build id, which replaces the previous deploy's
caches. A returning user sees the *Update available* notice and taps *Refresh*.

## If something looks wrong

- **A blank page or old version after a deploy**: close every tab of the site and open it again,
  or tap *Refresh* on the update notice. The old worker is replaced on the next visit.
- **A 404 on the first push**: Pages is not switched to *GitHub Actions* yet (setup step 2).
- **Your data**: it is stored in the browser for `santhoshprabhut2.github.io`, so clearing site
  data for that address removes it. Another browser or device starts empty (the demo data).
