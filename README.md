# Cookwise

**Cook smarter, live healthier.**

Cookwise is a mobile-first PWA that closes the loop most cooking apps leave open:

```
meal planning → groceries → pantry → measured cooking → nutrient retention → feedback → personalisation
                     ↑                                                                        │
                     └────────────────────────────────────────────────────────────────────────┘
```

It is not a recipe app. The product is the integration: ingredients logged
automatically from a camera and a scale, nutrient retention computed from the
temperatures and durations you actually cooked at, plans that re-optimise when
your evening changes, and a preference model that learns from every meal.

Everything works **offline with no API keys at all** — Supabase, Gemini and the
Python service are each optional upgrades.

---

## Features

| # | Feature | Where |
|---|---|---|
| 1 | Personal profile & 7-step onboarding (diet, goals, kitchen, taste, budget, priorities) | `/onboarding`, `/profile` |
| 2 | Adaptive 7-day meal plan — goal fit, budget, variety, expiry coverage, early spoilers first, and your own weekly cooking time per meal | `/plan` |
| 3 | Pantry with expiry tracking and automatic deduction after cooking | `/pantry` |
| 4 | Automatic ingredient logging — camera identification and a live weight/temperature dock | `/pantry/add`, cooking mode |
| 5 | Re-planning on schedule changes — less time, guests, eating out, mood, skipped meals | `/plan/adapt` |
| 6 | Guided cooking mode — verify ingredients, step timers, live sensor feedback | `/cook/session?id=` |
| 7 | Nutrient retention — USDA factors plus first-order thermal kinetics, with warnings | `/cook/session/retention?id=` |
| 8 | "Use expiring items" — recipes ranked by what is about to spoil | `/expiring` |
| 9 | Post-meal feedback — rating, taste, spice, texture, portion | `/cook/session/feedback?id=` |
| 10 | Personalisation — a preference model updated from every feedback | `src/lib/engines/learning.ts` |
| 11 | Grocery list & budget — plan minus pantry, pack-size rounding, cost estimate, milk / meat / herbs bought in fresh trips | `/plan/grocery` |
| 13 | Cook once, eat twice — a long dish is cooked once and reheated at the next rushed meal; every dish lists what to weigh out | `/plan`, `/cook` |
| 14 | Complete meals — lunch and dinner are a main dish with its rice or chapati (30 plates, with a filterable list); add your own foods with ingredient weights and the nutrition is worked out for you | `/meals`, `/foods` |
| 12 | Offline-first PWA — installable, service worker, IndexedDB, demo mode | `public/sw.js`, `src/app/manifest.ts` |

Every AI-backed feature has a deterministic local fallback, so nothing is ever
a dead end when the network or a key is missing.

---

## Screens

| Screen | Route |
|---|---|
| Splash | `/` |
| Onboarding (7 steps) | `/onboarding` |
| Sign in (email OTP) | `/auth` |
| Home | `/home` |
| Weekly plan | `/plan` |
| Grocery list | `/plan/grocery` |
| Plans changed / adapt | `/plan/adapt` |
| Cook tab | `/cook` |
| Complete meals | `/meals` |
| My foods / add / edit | `/foods`, `/foods/new`, `/foods/edit?id=` |
| Recipe detail | `/recipes/view?id=` |
| Cooking mode | `/cook/session?id=` |
| Nutrient retention | `/cook/session/retention?id=` |
| Feedback | `/cook/session/feedback?id=` |
| Pantry / add item | `/pantry`, `/pantry/add` |
| Use expiring items | `/expiring` |
| Profile | `/profile`, `/profile/edit` |

Per-screen specs live in [`docs/SCREENS.md`](docs/SCREENS.md).

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, React 19) — `proxy.ts` replaces `middleware.ts`; `params`, `cookies()` and `headers()` are async |
| Language | TypeScript 5 strict, zod at every API boundary |
| Styling | Tailwind v4 with design tokens in `src/app/globals.css` |
| State | Zustand 5, persisted to IndexedDB through Dexie |
| Backend | Supabase (Postgres + Auth + RLS) — optional |
| AI | Gemini via `@google/genai`, server-only routes under `src/app/api/ai/*` — optional |
| ML | Python 3.11 + FastAPI in `ml/` — optional |

Architecture contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Getting started

```bash
npm install
cp .env.example .env.local     # every value may stay blank
npm run dev                    # http://localhost:3000
```

That is enough. With no keys set the app runs in **demo mode**: a seeded
profile, pantry, recipe catalog and current-week plan, all stored in IndexedDB.

```bash
npm run build       # production build
npm run lint        # eslint
npx tsc --noEmit    # type check
```

---

## Demo mode vs Supabase

`isSupabaseConfigured()` (`src/lib/supabase/env.ts`) is the single switch:

| | Demo mode | Supabase configured |
|---|---|---|
| Trigger | `NEXT_PUBLIC_SUPABASE_URL` empty | URL + publishable key set |
| Identity | fixed local user `demo-user` | email-OTP account |
| Storage | IndexedDB only | IndexedDB, mirrored to Postgres |
| `/auth` | shows "Running in local demo mode" | email → 6-digit code |
| `src/proxy.ts` | no-op | refreshes the session cookie |

To turn Supabase on, add to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>    # server-only, seeding only
ADMIN_SEED_TOKEN=<any random string>
```

### Applying migrations

```bash
supabase link --project-ref <ref>
supabase db push
```

or paste `supabase/migrations/0001_init.sql` into the SQL editor. It is
idempotent, and it enables RLS on every table with owner-only policies, public
read on `ingredients` and public `recipes`, `updated_at` triggers and an
`auth.users` insert trigger that creates the `profiles` row. Details:
[`supabase/README.md`](supabase/README.md).

### Seeding the catalog

`ingredients` and `recipes` are public-read / service-role-write, so they are
populated through a guarded route:

```bash
curl -X POST http://localhost:3000/api/admin/seed -H "x-admin-token: $ADMIN_SEED_TOKEN"
# { "ok": true, "ingredients": 77, "recipes": 62 }
```

---

## Gemini setup

```
GEMINI_API_KEY=<key from https://aistudio.google.com/apikey>
GEMINI_MODEL=gemini-2.5-flash
```

Five server-only routes, each validated with zod and each with a local fallback:

| Route | Input | Output | Fallback when unavailable |
|---|---|---|---|
| `POST /api/ai/identify` | `{ imageBase64, mimeType, catalog }` | `IdentifyIngredientResult` | manual picker |
| `POST /api/ai/receipt` | `{ imageBase64, mimeType, catalog }` | `ReceiptScanResult` | manual entry |
| `POST /api/ai/meal-plan` | `MealPlanRequest` + recipe summaries | `{ meals: PlannedMeal[] }` | heuristic planner |
| `POST /api/ai/adapt` | `{ plan, change, profile, pantry, recipes }` | `{ meals: PlannedMeal[] }` | `adaptPlan()` |
| `POST /api/ai/cooking-state` | `{ imageBase64, stateCue }` | `{ matches, confidence, advice }` | user confirms manually |
| `GET /api/ai/status` | — | `{ gemini, ml }` | — |

Without a key every route answers `503 { fallback: true, reason }`; a Gemini
error answers `502` with the same shape. `src/lib/ai/client.ts` wraps all of
them and never throws:

```ts
const res = await aiMealPlan(request, recipes.map(toRecipeSummary));
const plan = res.ok ? res.data.meals : generateWeekPlan(request, recipes).meals;
```

Images are capped at 4 MB base64. The model never sees anything but the
prompt, the catalog ids and the image; keys stay server-side.

---

## Python ML service

Optional refinement of the nutrient-retention estimate. The TypeScript engine
is always the fallback.

```bash
cd ml
python -m venv .venv
source .venv/Scripts/activate        # Git Bash on Windows
pip install -r requirements.txt
python retention_model.py train      # fits 9 gradient-boosting models
uvicorn main:app --reload --port 8000
```

```
ML_SERVICE_URL=http://localhost:8000
```

`/api/ml/retention` proxies to it and degrades to `503 { fallback: true }`
whenever it is unset or unreachable. Full details in [`ml/README.md`](ml/README.md).

---

## Deploy to GitHub Pages

The app is published as a static, installable site. Push to `main` and the *Deploy to GitHub
Pages* workflow builds and publishes it; set **Settings → Pages → Source** to **GitHub Actions**
once. Live site: https://santhoshprabhut2.github.io/cookwise-agent/. Build and try it locally with
`npm run build:pages` and `npm run preview:pages`. Details, and what differs from the server build,
are in [docs/PAGES.md](docs/PAGES.md).

## PWA install

The manifest is generated by `src/app/manifest.ts` and served at
`/manifest.webmanifest`. `public/sw.js` is a hand-written service worker:
network-first for navigations (falling back to `/offline.html`),
stale-while-revalidate for `/_next/static/`, fonts and images, and `/api/*` is
never cached.

- **Android / Chrome / Edge** — the install prompt is captured at app start by
  `<InstallPrompt />` in the root layout and offered by `useInstallPrompt()` in
  `src/components/pwa/InstallPrompt.tsx` (Profile → settings → *Install app*).
- **iOS Safari** — Share → *Add to Home Screen*; the settings sheet shows these steps on iPhone
  and iPad, where there is no install event.
- **Updates** — when a new version has installed, `UpdateNotice` offers *Refresh* instead of
  waiting for every tab to close.
- The worker only registers in production builds (`npm run build && npm start`),
  so `next dev` is never served stale chunks.

Icons are generated by `scripts/gen-icons.py` into `public/icons/`. What is checked, and the
known limits (notably Web Bluetooth on iOS), are in [docs/PWA.md](docs/PWA.md).

---

## Tests

```bash
npm test                     # vitest — TypeScript engines, stores and seed data
cd ml && python -m pytest    # 16 Python tests, including the FastAPI routes
cd ml && python selfcheck.py # same invariants, no pytest needed
```

---

## Folder structure

```
src/
  app/
    (tabs)/home plan cook pantry profile   tab screens (BottomNav layout)
    auth/                                  email-OTP sign-in + callback route
    api/ai/*                               Gemini route handlers
    api/admin/seed                         catalog upsert (service role)
    api/ml/retention                       proxy to the Python service
    manifest.ts                            PWA manifest
  components/
    ui/ layout/ features/                  primitives, shell, per-domain UI
    pwa/                                   service worker + install prompt
  lib/
    types.ts utils.ts                      domain model and helpers
    data/                                  Dexie db, zustand stores, seed, sync
    engines/                               planner, grocery, retention, learning, sensor
    ai/                                    gemini.ts prompts.ts schemas.ts client.ts
    supabase/                              env, client, server, proxy, auth, types
  proxy.ts                                 Next 16 proxy (session refresh)
supabase/migrations/0001_init.sql          schema + RLS
ml/                                        FastAPI retention service
public/                                    sw.js, offline.html, icons/
docs/ARCHITECTURE.md                       the contract every contributor codes against
```

---

## Environment variables

All optional; see `.env.example`.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL; empty ⇒ demo mode |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; bypasses RLS, used by `/api/admin/seed` |
| `ADMIN_SEED_TOKEN` | Shared secret for the `x-admin-token` seed header |
| `GEMINI_API_KEY` | Enables the `/api/ai/*` routes |
| `GEMINI_MODEL` | Defaults to `gemini-2.5-flash` |
| `ML_SERVICE_URL` | Enables `/api/ml/retention` |
