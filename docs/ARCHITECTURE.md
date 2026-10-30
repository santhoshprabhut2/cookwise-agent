# Cookwise — Architecture & Build Brief

Cookwise is a mobile-first web app (PWA) that closes the loop
**meal planning → groceries → pantry → measured cooking → nutrient retention → feedback → personalisation**.
It is not a recipe app; the integration of automatic ingredient logging (camera + scale),
real-time nutrient retention, adaptive planning and waste reduction is the product.

This document is the contract every contributor (human or agent) codes against.
Read it fully before writing code. `src/lib/types.ts` is the domain model and must not
be changed without updating the Supabase migration and this doc.

---

## 1. Stack (pinned)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.3** (App Router, Turbopack, React 19.2) | Read `node_modules/next/dist/docs/` before using any Next API. `params`/`searchParams`/`cookies()`/`headers()` are **async**. `middleware.ts` is replaced by `proxy.ts` (`export function proxy`). Use the global `PageProps<"/route">` / `LayoutProps<"/">` helpers. |
| Language | TypeScript 5, `strict` | No `any`. Zod for runtime validation at API boundaries. |
| Styling | **Tailwind v4** with tokens in `src/app/globals.css` | Use the token colours (`bg-primary`, `text-text-2`, `bg-green-100`, `bg-orange-100`, …), not raw hex. |
| Icons | `lucide-react` | |
| State | **Zustand 5** stores, persisted to **IndexedDB via Dexie** | Local-first. The app must work with no network and no Supabase keys ("demo mode"). |
| Backend | **Supabase** (Postgres + Auth + RLS) via `@supabase/supabase-js` + `@supabase/ssr` | Optional at runtime: when `NEXT_PUBLIC_SUPABASE_URL` is unset the app runs purely local. Migrations live in `supabase/migrations`. |
| AI | **Gemini** via `@google/genai` (server-only routes under `src/app/api/ai/*`) | Model id from `GEMINI_MODEL` (default `gemini-2.5-flash`). Every AI feature has a deterministic local fallback. |
| ML service | **Python 3.11 + FastAPI** in `ml/` | Optional nutrient-retention model service; the TypeScript engine is the offline fallback. |
| Validation | `zod` | |
| Dates | `date-fns` + helpers in `src/lib/utils.ts` | |

Node 20.17 is installed. Package manager is **npm**. Run `npm run build`, `npx tsc --noEmit` and `npm run lint` before declaring work done.

---

## 2. Folder ownership

```
src/
  app/
    layout.tsx                 root shell (done) — Inter font, .app-shell wrapper
    globals.css                design tokens (done)
    page.tsx                   splash / "Get Started" (redirects to /home when onboarded)
    onboarding/                multi-step onboarding wizard
    auth/                      Supabase email-OTP sign-in (only shown when Supabase configured)
    (tabs)/                    route group with BottomNav in its layout
      home/  plan/  cook/  pantry/  profile/
      meals/  foods/           complete meals list; custom foods (list, new, [id])
    recipes/[id]/              recipe detail
    cook/[sessionId]/          cooking mode (verify → steps → retention → feedback)
    expiring/                  "Use expiring items"
    plan/grocery/  plan/adapt/ grocery list, schedule-change / re-plan
    api/ai/*/route.ts          Gemini-backed route handlers
    manifest.ts                PWA manifest
  components/
    ui/                        primitives (Button, Card, Chip, StatPill, ProgressBar, Sheet, Input, …)
    layout/                    AppHeader, BottomNav, Page
    features/<domain>/         feature components (pantry/, plan/, cook/, home/, profile/, onboarding/)
  lib/
    types.ts                   domain model (done)
    utils.ts                   helpers (done)
    data/
      db.ts                    Dexie database (kv + tables)
      storage.ts               zustand persist storage adapter over Dexie
      seed/                    ingredients.ts, recipes.ts, demoUser.ts
      stores/                  useProfileStore, usePantryStore, useRecipeStore, usePlanStore,
                               useGroceryStore, useCookStore, useFeedbackStore, usePreferenceStore
      sync.ts                  Supabase push/pull mirror (no-op in demo mode)
    supabase/
      client.ts server.ts proxy.ts env.ts   (isSupabaseConfigured())
    engines/
      planner.ts               heuristic 7-day planner + adaptation
      retention.ts             nutrient retention model (USDA factors + kinetics)
      learning.ts              feedback → PreferenceModel updates
      sensor.ts                sensor dock abstraction + simulator (weight + temperature)
      grocery.ts               plan − pantry → grocery list
    ai/
      gemini.ts                server-only client + JSON helpers
      prompts.ts
      client.ts                browser helpers that call /api/ai/* with fallbacks
supabase/
  migrations/0001_init.sql     schema + RLS
  seed.sql                     catalog rows
ml/
  README.md  requirements.txt  main.py (FastAPI)  retention_model.py  data/retention_factors.csv
public/
  icons/  sw.js  (service worker) recipes/ (optional local images)
docs/
  ARCHITECTURE.md (this)  SCREENS.md (mockup spec)
```

Agents own the folders assigned in their brief. Do not edit files outside your folders except
`docs/` notes; if a shared file must change, describe the change in your final report instead.

---

## 3. Design language (from the reference mockups)

- **Ground** off-white `bg-bg` (#f6f7f4). **Cards** white, `rounded-2xl`, hairline `border-border`, `shadow-card`.
- **Primary** deep green `bg-primary` (#1f6b45) with white text; large CTAs are full-width pill buttons
  (`rounded-full`, height 52px, font-semibold, trailing arrow icon). Secondary is white with border.
- **Positive chips** `bg-green-100 text-green-700` ("High Protein", "Good range", "Perfect amount!").
- **Alert / expiry chips** `bg-orange-100 text-orange-600` ("2 days", "Uses 2 expiring items"). Neutral chips
  `bg-surface-2 text-text-2` ("> 30 days").
- **Typography** Inter. Page titles 22–24px bold; card titles 15–16px semibold; body 14px; captions 12px `text-text-2`.
- **Header pattern** back chevron (left) + centered/leading title + optional action icon on the right.
- **Bottom nav** 5 tabs — Home, Plan, Cook, Pantry, Profile — lucide icons `Home, CalendarDays, ChefHat, ShoppingBasket, User`;
  active tab is `text-primary` with a small label, inactive `text-text-3`. Height 68px, white, top hairline, safe-area padding.
- **Stat pills** (⏱ 20 min · 🔥 320 kcal · 💪 24g protein): small rounded boxes `bg-surface-2` with an icon and bold value.
- **Progress bars** 8px tall, `track` bg, green fill; orange fill when a value is poor (<60%).
- **Images** — no external image hosts (offline). Every recipe/ingredient has an `emoji`; render a soft gradient tile
  (`bg-green-50` / `bg-orange-50`) with the emoji at 28–40px when `imageUrl` is missing. If `imageUrl` is present it is a local `/recipes/*.jpg`.
- **Motion** subtle: `fade-up` on page mount, `pulse` on live sensor values. Respect reduced motion.
- **Touch targets** ≥ 44px. Content width 100% up to 430px; on desktop the shell is centred with a soft frame.

Full per-screen spec: `docs/SCREENS.md`.

---

## 4. Data layer contract

### 4.1 Persistence
- `src/lib/data/db.ts` exports a Dexie instance `db` with a single `kv` table `{ key: string; value: unknown }`
  used by the zustand persist adapter, plus (optional) indexed tables if a store needs queries.
- `src/lib/data/storage.ts` exports `idbStorage` (a zustand `StateStorage` implementation) and a
  `useHydrated()` hook that resolves true after all persisted stores rehydrate. Screens must render a skeleton until hydrated.
- Demo mode: on first load with an empty DB the stores seed the demo user (Santhosh, Chennai, muscle gain), a pantry
  matching the mockup (Tomato 500 g / 2 days, Onion 1 kg / 5 days, Eggs 6 pcs / 7 days, Chicken 500 g / 3 days,
  Spinach 200 g / 3 days, Milk 1 L / 4 days, Rice 1 kg / >30 days, Coconut 1 pc / 7 days), the recipe catalog and a
  current-week plan whose today's dinner is Egg Bhurji. Seeding is idempotent.

### 4.2 Stores (Zustand, `src/lib/data/stores/`)
Each store is `create<State>()(persist(..., { name, storage: idbStorage }))` and exports typed selectors.
The names below are fixed so screens can be built in parallel.

```ts
useProfileStore:   { profile: UserProfile | null; setProfile(p: Partial<UserProfile>); completeOnboarding(); reset() }
useRecipeStore:    { recipes: Recipe[]; byId(id): Recipe|undefined; search(q, filters?): Recipe[]; upsert(r: Recipe) }
usePantryStore:    { items: PantryItem[]; add(input: Omit<PantryItem,'id'|'userId'|'addedAt'|'updatedAt'>): PantryItem;
                     update(id, patch); remove(id); consume(ingredientId, grams): void;
                     expiring(withinDays=3): PantryItem[]; totalGrams(ingredientId): number }
usePlanStore:      { plans: MealPlan[]; changes: ScheduleChange[];
                     currentPlan(weekStart?): MealPlan|undefined;
                     generate(weekStart, opts?: { useAI?: boolean }): Promise<MealPlan>;
                     swapMeal(mealId, recipeId); lockMeal(mealId, locked); updateMeal(mealId, patch);
                     addMeal(planId, date, mealType, recipeId, servings); removeMeal(mealId);
                     setStatus(mealId, status);
                     applyChange(change: Omit<ScheduleChange,'id'|'userId'|'createdAt'>): Promise<MealPlan> }
useGroceryStore:   { lists: GroceryList[]; forPlan(planId): GroceryList|undefined;
                     generateForPlan(planId): GroceryList; togglePurchased(itemId); moveToPantry(listId) }
useCookStore:      { sessions: CookSession[]; activeId: ID|null; active(): CookSession|undefined;
                     start(recipeId, servings, plannedMealId?): CookSession;
                     logIngredient(log: IngredientLog); startStep(stepId); endStep(stepId, summary?);
                     addTemp(sample: TempSample); setRetention(est: RetentionEstimate);
                     complete(): CookSession /* deducts pantry once, marks planned meal cooked */;
                     abandon() }
useFeedbackStore:  { feedback: MealFeedback[]; add(f: Omit<MealFeedback,'id'|'userId'|'createdAt'>): MealFeedback /* also updates preference model */ }
usePreferenceStore:{ model: PreferenceModel; apply(f: MealFeedback, recipe: Recipe): void; reset() }
```

Derived helpers live in `src/lib/data/selectors.ts` (e.g. `todaysMeals(plan)`, `dailyIntake(date)`, `weeklyKcalProgress()`).

### 4.3 Supabase
- `supabase/migrations/0001_init.sql` creates tables mirroring `types.ts` (snake_case columns, `jsonb` for nested
  arrays like `ingredients`, `steps`, `meals`, `items`, `*_logs`, `temperature_history`), `profiles` keyed by `auth.users.id`,
  RLS "owner only" on every user table, public read on `ingredients` and public `recipes`, `updated_at` triggers.
- `src/lib/supabase/env.ts` → `isSupabaseConfigured()`; `client.ts` (browser), `server.ts` (RSC / route handlers, async cookies), `proxy.ts` helper for session refresh used by `src/proxy.ts`.
- `src/lib/data/sync.ts` → `startSync()` no-ops in demo mode; otherwise pulls the user's rows on sign-in (newer `updated_at` wins) and pushes store changes debounced (500 ms) with upserts. Never blocks the UI.

---

## 5. Engines (pure TypeScript, unit-testable, `src/lib/engines/`)

- **planner.ts** `generateWeekPlan(req: MealPlanRequest, recipes: Recipe[]): MealPlan` — scores recipes by goal fit
  (kcal/protein vs targets), diet/allergy/equipment compatibility (hard filters), time availability, budget
  (`costPerServing` × 7 days × 3 meals ≤ monthly budget / 4.3), expiring-pantry coverage (waste reduction),
  cuisine/tag/recipe affinity from `PreferenceModel`, variety penalty (no repeat within 3 days), spice fit.
  `adaptPlan(plan, change, ctx)` re-optimises the remaining meals: `less_time` → recipes with total time ≤ available;
  `guests` → scale servings and prefer `guest_friendly`; `eating_out` → mark meal `eating_out` and rebalance the day's kcal;
  `mood_change` → bias tags; `skip_meal` → remove and re-spread ingredients. Locked meals never change.
- **grocery.ts** `buildGroceryList(plan, recipes, pantry)` — sums grams needed, subtracts pantry stock (only stock that
  does not expire before the meal date), rounds to sensible pack sizes, estimates cost from `costPerKg`.
- **retention.ts** `estimateRetention(input: { recipe, ingredientLogs, stepLogs, temperatureHistory, servings })`
  → `RetentionEstimate`. Model: per-nutrient base retention factors by cooking method (USDA Table of Nutrient
  Retention Factors, Release 6, approximated), then first-order degradation for heat-labile nutrients:
  `R = base · exp(−k · Δt)`, `k = k_ref · Q10^((T − T_ref)/10)` with `T_ref = 100 °C`, `Q10 ≈ 2` (vitamin C, folate, B6)
  and `Q10 ≈ 1.5` (vitamin A); protein/fat/fiber/minerals are only affected by leaching (boiling) and charring (>200 °C).
  Overall = weighted mean (vitamin C 0.25, folate 0.15, B6 0.15, A 0.1, protein 0.2, fat 0.05, iron 0.05, calcium 0.025, fiber 0.025).
  Warnings: `warn` when a nutrient < 60 %, `critical` < 40 %, plus temperature-too-high (> 180 °C for sautéing) and
  overcooking (step duration > 1.5× planned). Also export `liveRetentionHint(step, currentTempC, elapsedSec)` for the cooking screen.
- **learning.ts** `applyFeedback(model, feedback, recipe)` — exponential moving updates (α = 0.3) to recipe score
  (rating − 3)/2, ingredient/cuisine/tag affinities, spice adjust (`too_hot` → −0.2, `too_mild` → +0.2), portion adjust
  (`too_little` → ×1.1, `too_much` → ×0.9), clamped. `recommend(recipes, model, profile, n)`.
- **sensor.ts** `interface SensorDock { connect(); disconnect(); subscribe(cb: (r: SensorReading)=>void); tare(); }`
  with `SimulatedDock` (weight ramps toward a target set via `simulateAdd(grams)`, settles with noise, temperature drifts
  toward `setBurner(level)`), and a `WebBluetoothDock` stub that throws a friendly error when unsupported.

---

## 6. AI routes (`src/app/api/ai/*`, server-only)

All routes validate input with zod, return typed JSON from `types.ts`, and respond `503 { fallback: true }` when
`GEMINI_API_KEY` is missing so the browser helper (`src/lib/ai/client.ts`) can fall back locally.

| Route | Input | Output | Fallback |
|---|---|---|---|
| `POST /api/ai/identify` | `{ imageBase64, mimeType, catalog: {id,name}[] }` | `IdentifyIngredientResult` | manual picker |
| `POST /api/ai/receipt` | `{ imageBase64, mimeType, catalog }` | `ReceiptScanResult` | manual entry |
| `POST /api/ai/meal-plan` | `MealPlanRequest` + `recipes` summary | `{ meals: PlannedMeal[] }` | heuristic planner |
| `POST /api/ai/adapt` | `{ plan, change, profile, pantry, recipes }` | `{ meals: PlannedMeal[] }` | `adaptPlan` |
| `POST /api/ai/cooking-state` | `{ imageBase64, stateCue }` | `{ matches: boolean; confidence; advice }` | user confirms manually |

Use `responseMimeType: "application/json"` + `responseSchema` for structured output.

---

## 7. Screens → features map

| Screen | Route | Features covered |
|---|---|---|
| Splash | `/` | 1 |
| Onboarding (7 steps) | `/onboarding` | 1 |
| Home | `/home` | 2, 3, 6, 8 entry points; daily kcal progress |
| Weekly Plan | `/plan` | 2, 5 (swap/edit/lock, adapt) |
| Grocery | `/plan/grocery` | 2, 11 |
| Adapt | `/plan/adapt` | 5 |
| Cook tab | `/cook` | 6 entry; today's meals; recommended; expiring |
| Complete meals | `/meals` | 2, 6 (whole plates for lunch and dinner, filterable) |
| My foods | `/foods`, `/foods/new`, `/foods/[id]` | 2, 6 (add a dish with ingredient weights; edit, delete) |
| Recipe detail | `/recipes/[id]` | 6 |
| Cooking mode | `/cook/[sessionId]` | 4, 6, 7 (verify ingredients → steps with live weight/temp → retention → feedback) |
| Nutrient retention | `/cook/[sessionId]/retention` | 7 |
| Feedback | `/cook/[sessionId]/feedback` | 9, 10 |
| Pantry | `/pantry`, `/pantry/add` | 3, 4 (scan / dock / receipt / manual) |
| Use expiring | `/expiring` | 8 |
| Profile | `/profile`, `/profile/edit` | 1, 10 |

---

## 8. Conventions

- Client components (`"use client"`) for anything using stores or browser APIs; keep `page.tsx` files thin.
- Never import `@google/genai` or the service-role key in client code.
- No `localStorage` for domain data; only the Dexie adapter.
- Every list has an empty state. Every async action has a loading and error state.
- Accessibility: buttons have labels, icons are `aria-hidden`, colour is never the only signal.
- Commit nothing; the orchestrator commits.
