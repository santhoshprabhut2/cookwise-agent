# Cookwise and the Smart Cooking Assistant

This repository holds two projects that share an idea, an AI agent that plans and cooks meals.

| Project | What it is | Where it lives |
|---|---|---|
| **Cookwise** | A Next.js progressive web app: weekly meal plan, pantry, guided cooking with nutrient retention, complete meals and your own foods. Installable and works offline. Live at https://santhoshprabhut2.github.io/cookwise-agent/ | `src/`, `public/`, `docs/` and the first half of this file |
| **Smart Cooking Assistant** | A Python and Streamlit agent that uses OpenAI function calling to manage a pantry, suggest recipes and log meals, backed by SQLite | `app.py`, `main.py`, `tools.py`, `schema.sql`, `.streamlit/` and the [second half of this file](#smart-cooking-assistant--an-agentic-ai) |

The two do not share code. Each keeps its own dependencies (`package.json` for Cookwise,
`requirements.txt` for the Streamlit app), so working on one does not touch the other.

---

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

---

# Smart Cooking Assistant — an Agentic AI

An autonomous agent that manages a home pantry, suggests recipes you can actually cook
tonight, plans the week, logs meals and tracks nutrition. The LLM decides which tools to
call; the tools do the real work against a SQLite database.

Built with the **OpenAI function-calling loop** (agentic AI pattern): the model is given a
set of tools plus live context, it chooses a tool, reads the result, and loops until it can
answer — no hardcoded conversation flow.

---

## 1. Features

| Capability | What the agent does |
|---|---|
| Pantry management | Adds ingredients, tops up duplicates, tracks expiry, deducts what you cook |
| Recipe suggestions | Ranks recipes by pantry coverage, expiring items, your past ratings and fitness goal |
| Diet & allergy safety | Filters out anything clashing with your diet or allergies before ranking |
| Meal planning | Builds a weekly plan with per-day calorie totals and a shopping list |
| Meal logging | Records what you actually cooked, with the calorie total for that meal |
| Feedback loop | Ratings feed back into the ranking, so disliked dishes sink |
| Nutrition tracking | Per-serving macros scaled to the servings you ate |
| Recipe authoring | Saves new dishes you describe so they can be planned and rated later |

## 2. Architecture

```
        User  --->  CLI (main.py)
                      |
                      |            Browser  --->  Streamlit UI (app.py)
                      |                                |
                      +---------------+----------------+
                                      v
                        +-----------------------------+
                        |   Agent loop (main.py)      |
                        |   OpenAI chat.completions   |
                        |   tool_choice="auto"        |
                        +-----------------------------+
                             |                  ^
                   tool call |                  | tool result (string)
                             v                  |
                        +-----------------------------+
                        |   Tool layer (tools.py)     |
                        |  12 deterministic functions |
                        +-----------------------------+
                                     |
                                     v
                          SQLite (cooking_assistant.db)
                   users | pantry | recipes | meal_plans | meal_log | feedback
```

Both front ends drive the *same* agent loop and the *same* database — the browser UI is not
a reimplementation, it just renders the loop's output and the database state.

The loop is the key idea: `main.py` never decides what to do. It sends the conversation plus
the tool schemas, executes whatever the model asks for, appends the result, and repeats until
the model returns plain text (max 8 rounds per turn as a safety valve).

### The 12 tools

| Tool | Purpose |
|---|---|
| `add_pantry_item` | Add or top up a pantry item with an expiry date |
| `get_pantry_items` | List the pantry, flagging expiring and expired items |
| `remove_pantry_item` | Remove an item or deduct a quantity after cooking |
| `suggest_recipe` | Rank cookable recipes (diet, allergy, time, expiry, rating aware) |
| `add_recipe` | Save a new recipe so it can be planned and rated |
| `get_nutrition` | Macros for a recipe, scaled to servings |
| `log_meal` | Record a meal that was actually cooked |
| `provide_feedback` | Store a 1–5 rating that influences future ranking |
| `plan_meal` | Put a recipe into a day/slot of the weekly plan |
| `get_meal_plan` | Show the plan with per-day calorie totals |
| `get_user_profile` | Read diet, allergies, health issues, goal, budget |
| `save_user_profile` | Update the profile (only the fields that changed) |

## 3. Files

```
main.py            agent loop, 12 tool schemas, CLI
app.py             Streamlit web UI (same agent, browser front end)
tools.py           the 12 tool implementations - all real logic, no stubs
schema.sql         6 tables + indexes, idempotent
seed_recipes.py    14 recipes with ingredients, steps and nutrition
test_tools.py      44 offline tests (no API key required)
requirements.txt   openai, python-dotenv, streamlit
.env.example       copy to .env and add your key
.gitignore         keeps .env and the database out of git
```

## 4. Setup

```bash
git clone https://github.com/santhoshprabhut2/cookwise-agent.git
cd cookwise-agent

python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env             # then paste your OpenAI key into .env
```

## 5. Run

```bash
python main.py                                   # interactive chat
python main.py --once "what can I cook tonight?" # one turn, good for a demo
python main.py --verbose                         # show every tool call
python main.py --reset                           # wipe the local database
```

Or use the web UI:

```bash
streamlit run app.py
```

The sidebar shows your live pantry and this week's plan straight from the database, plus a
profile form you can edit. Change your diet to `vegan` and ask for dinner again to watch the
suggestions change. After each answer, the **"What the agent did"** panel lists every tool
call the model made and the raw result it got back — that panel is the clearest evidence the
system is genuinely agentic rather than a scripted chatbot.

Bind to localhost if you are on an untrusted network:

```bash
streamlit run app.py --server.address 127.0.0.1
```

Verify everything without an API key:

```bash
python test_tools.py
```

### Sample interaction

```
$ python main.py --verbose

You: I bought 4 tomatoes, they'll go bad in 2 days
  [tool] add_pantry_item({"ingredient": "tomato", "quantity": 4, "unit": "pcs", "expiry_days": 2})
Agent: Added 4 pcs of tomato in the pantry, expiring 2026-10-13. What else is in the kitchen?

You: also 2 onions, 1 cup rice and some curd
  [tool] add_pantry_item({"ingredient": "onion", ...})
Agent: Noted. Your curd is at 1 cup and expires tomorrow, so use it soon.

You: I'm vegetarian, allergic to peanuts, trying to lose weight
  [tool] save_user_profile({"diet": "vegetarian", "allergies": "peanuts", "fitness_goal": "weight loss"})
Agent: Saved. I'll keep eggs, meat and peanuts out of your suggestions.

You: what should I cook tonight?
  [tool] suggest_recipe({"max_time": 30})
Agent: Three options, best first:
  1. Tomato Rice (25 min) - you have 3 of 6 ingredients, just need curry leaves,
     mustard seeds and oil. ~330 kcal per serving, and it uses up your tomatoes.
  2. Curd Rice (15 min, no cooking) - need mustard seeds, ginger and curry leaves.
     ~270 kcal, and it saves the curd expiring tomorrow.
  3. Dal Tadka (30 min) - needs toor dal, garlic, ghee and cumin. ~240 kcal.
```

The ranking above is produced by real tool output, reproduced here verbatim:

```
Top 3 recipe(s) for user 1 (max 30 min):

1. Tomato Rice  -  25 min, one-pot
   pantry: you have 3 of 6 ingredients (50%)
   missing: curry leaves, mustard seeds, oil
   nutrition: 330kcal, 7g protein, 60g carbs, 7g fat, 3g fiber per serving
   why: uses 1 item(s) expiring soon; fits weight loss (330 kcal)

2. Curd Rice  -  15 min, no-cook
   pantry: you have 2 of 5 ingredients (40%)
   missing: mustard seeds, ginger, curry leaves
   nutrition: 270kcal, 9g protein, 46g carbs, 5g fat, 2g fiber per serving
   why: uses 1 item(s) expiring soon; fits weight loss (270 kcal)
```

Notice the agent suggested the curd dish partly because the curd expires tomorrow — that
ordering comes from scoring, not from the model's imagination.

## 6. How the ranking works

```
score = coverage x 60      # share of ingredients already in the pantry
      + rating      x 4    # your average rating, defaults to 3
      + rescued     x 8    # expiring items the recipe would use up
      + goal bonus         # lighter food for weight loss, protein for muscle gain
      + 15                 # flat bonus when nothing is missing at all
```

Recipes that clash with the user's diet or allergies are dropped **before** scoring, so
they can never appear. `vegetarian` excludes egg (use `eggetarian` if you eat eggs),
`vegan` also excludes dairy.

Ingredient matching is fuzzy on purpose: "2 Tomatoes" in the pantry satisfies a recipe
asking for 1 tomato, and `Dahi` is treated as `curd`, via a small synonym map.

## 7. Design decisions worth explaining

- **Deterministic tools, probabilistic planner.** The LLM picks *what* to do; the ranking,
  filtering and arithmetic live in Python. That makes suggestions reproducible and testable.
- **Tools return strings, never raise.** A bad tool call comes back as text the model can
  read and recover from, so one bad argument does not kill the conversation.
- **Arguments are filtered against the real signature.** If the model invents a parameter,
  it is dropped and the fact is reported back to it.
- **`get_nutrition` refuses to guess.** For an unknown dish it says so and offers
  `add_recipe`, instead of inventing calories.
- **The profile is injected into the system prompt** every turn, along with a live pantry
  snapshot, so the model starts oriented without burning a tool call.

## 8. Known limitations

- Ingredient matching is name-based, not a real ontology; quantities are only compared when
  the units match. "500 g chicken" satisfies a recipe needing "200 g chicken".
- Nutrition values are approximate seed data, fine for planning, not for medical use.
- Health conditions are handled with a light touch: diabetes down-ranks high-carb dishes and
  warns, but this is not dietary advice.
- Single-user CLI; there is no auth or web UI. The `user_id` column is there for multi-user use.

## 9. Grading criteria mapping

| Criterion | Where to look |
|---|---|
| Agentic behaviour (autonomous tool selection) | `main.py` `run_agent`, `TOOL_SCHEMAS` |
| Tool/function implementation | `tools.py`, all 12 functions |
| Database design | `schema.sql`, 6 normalised tables with foreign keys |
| Domain logic (the hard part) | `suggest_recipe` scoring, `_blocks_recipe` filtering |
| Feedback loop | `provide_feedback` writes, `suggest_recipe` reads the average |
| Testing | `test_tools.py`, 44 tests, runs without an API key |
| Documentation | this file |
| Deployment | `app.py` secret merging, `.streamlit/`, section 11 |

## 10. The repository

The project lives at **https://github.com/santhoshprabhut2/cookwise-agent**, on branch `main`.

Clone and run it:

```bash
git clone https://github.com/santhoshprabhut2/cookwise-agent.git
cd cookwise-agent
pip install -r requirements.txt
python test_tools.py     # verifies the whole tool layer, no API key needed
streamlit run app.py     # the reader supplies their own key in .env
```

## 11. Deployment

The web UI ships cloud-ready. It is deployed on **Streamlit Community Cloud**:

1. Fork or use this repository.
2. Sign in at [share.streamlit.io](https://share.streamlit.io) (GitHub or Google).
3. **Create app → Deploy a public app from GitHub**, pick this repo, branch `main`, main
   file `app.py`, and let Streamlit pick the Python version.
4. Before or after deploying, open **App settings → Secrets** and paste:

   ```toml
   OPENAI_API_KEY = "sk-..."
   ```

   There is a ready-made template in `.streamlit/secrets.example.toml`.

Notes for a deployed instance:

- `app.py` merges `st.secrets` into the process environment at startup, so the same
  key-loading path works locally (`.env`) and in the cloud (`secrets`).
- The SQLite database is recreated and the 14 recipes re-seeded on every fresh container
  start (`tools.init_db(seed=True)` runs at boot), so no migration step is needed. Anything
  added while the app runs is stored in SQLite and lasts until the container restarts; the
  `.gitignore`/`reset` button in the sidebar work exactly the same as locally.
- The API key never touches the repository: locally it lives in `.env`, in the cloud in the
  encrypted Streamlit secrets store.
