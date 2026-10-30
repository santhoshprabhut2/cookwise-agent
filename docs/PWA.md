# Cookwise as a progressive web app

Cookwise is an installable, offline-first PWA. There is nothing to add to make it one; this
page records how it works and what has been checked.

## The pieces

| Piece | Where | What it does |
|---|---|---|
| Web app manifest | `src/app/manifest.ts` → `/manifest.webmanifest` | Name, `standalone` display, `start_url: /home`, `scope: /`, 192 and 512 px icons, an SVG icon, a maskable icon, three shortcuts (plan, cook, pantry). |
| Service worker | `public/sw.js` | Navigations: network first, then the cached page, then `/offline.html`. `/_next/static/*`, icons, fonts and images: stale while revalidate. `/api/*`: never cached, so the AI fallbacks fire correctly. |
| Registration | `src/components/pwa/ServiceWorkerRegister.tsx` | Registers `/sw.js` in production builds only, so `next dev` never serves stale chunks. |
| Offline page | `public/offline.html` | Shown for a page that was never cached. |
| Install | `src/components/pwa/InstallPrompt.tsx`, mounted in `src/app/layout.tsx` | Captures Chrome's one-shot `beforeinstallprompt` event at app start. Profile → settings shows *Install app*; on iPhone and iPad it shows the Share → Add to Home Screen steps instead. |
| Updates | `src/components/pwa/UpdateNotice.tsx` | When a new worker has installed, offers *Refresh* (posts `SKIP_WAITING`, the page reloads when the new worker takes over). |
| Data | Dexie / IndexedDB | Every plan, pantry and cooking record lives on the device, which is why the app is useful with no network at all. |

`next.config.ts` serves `/sw.js` and the manifest with `max-age=0, must-revalidate` and adds
`Service-Worker-Allowed: /`, so a deploy reaches users on their next visit.

**On GitHub Pages** the same files run under the repository's address (`/cookwise-agent/`), where
headers cannot be set. The worker works out its own base path from its scope, is registered with
`?slash=1` so it knows pages are served as folders (`/home/`), and is given the list of every built
file so the whole app is cached on the first visit. It does not use navigation preload, because
when the network is down a failed preload can hide the cached page. Manifest and icon URLs go
through `src/lib/base-path.ts`. See [PAGES.md](PAGES.md).

## What was checked (production build, `npm run build` then `npm start`)

- The worker registers, activates and **controls the page**; its scope is `/`.
- The manifest is served as `application/manifest+json` with the fields above.
- The precache holds the six shell routes (`/`, `/home`, `/plan`, `/cook`, `/pantry`,
  `/profile`), `/offline.html`, the manifest and every icon; visited pages and `/_next/static`
  assets are added to the runtime cache.
- **With the server stopped**, reloading `/home` still renders with its data, navigating to
  `/plan` works (including the new ingredient quantities), and a page that was never visited shows
  the offline page.
- A synthetic `beforeinstallprompt` fired on Home is captured, and *Install app* then appears on
  the Profile screen, shows the native prompt and reports "Cookwise installed". The listener used
  to live in a module that only the Profile screen imported, so on any other page the one-shot
  event could be missed; it is now mounted in the root layout.
- A synthetic update event shows the banner, and *Refresh* posts `SKIP_WAITING` to the waiting
  worker.
- The iOS home-screen icon is the 180 px `apple-touch-icon.png` (it was the 192 px icon).

## Not checked

- A real install on a phone or in desktop Chrome, and a real iPhone *Add to Home Screen*. The
  install and update events above were simulated, because they cannot be triggered from the
  browser pane used for testing.
- A Lighthouse run.

## Known limits

- **The sensor dock needs Web Bluetooth**, which Chrome and Edge provide on Android and desktop
  but **Safari on iPhone and iPad does not**. An installed PWA on iOS can run everything except
  pairing a real dock; the simulated dock still works there. A Flutter or native build, as the
  project report plans, would avoid this.
- The manifest has no `screenshots`, so Chrome shows its plain install dialog rather than the
  richer one.
- There are no push notifications.
- `theme-color` in the page head is the light app background (`#f6f7f4`), while the manifest's
  `theme_color` is the brand green. The head tag wins while the app is open.

## Trying it

```bash
npm run build
npm start
```

Open http://localhost:3000 in Chrome, then DevTools → Application: *Manifest*, *Service workers*
and *Cache storage*. Tick *Offline* under Service workers and reload to see the offline behaviour.
