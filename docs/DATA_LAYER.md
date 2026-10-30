# Cookwise — Data layer usage guide

Everything a screen needs from `src/lib/data`. Implements ARCHITECTURE §4.

```
src/lib/data/
  db.ts            Dexie "cookwise" DB + kv helpers (browser only, memory fallback)
  storage.ts       zustand persist adapter over Dexie + the hydration gate
  selectors.ts     pure derived helpers (no store imports — safe anywhere)
  sync.ts          Supabase mirror (no-op in demo mode)
  seed/            ingredients.ts recipes.ts demoUser.ts index.ts (ensureSeeded)
  stores/          profile pantry recipes plan grocery cook feedback preference
```

---

## 1. Import paths

```ts
import {
  useProfileStore, usePantryStore, useRecipeStore, usePlanStore,
  useGroceryStore, useCookStore, useFeedbackStore, usePreferenceStore,
} from "@/lib/data/stores";

import { useHydrated } from "@/lib/data/storage";
import { todaysMeals, nextMealToday, dailyIntake } from "@/lib/data/selectors";
import { ensureSeeded, resetDemoData } from "@/lib/data/seed";
import { INGREDIENTS, ingredientById } from "@/lib/data/seed/ingredients";
import { RECIPES, recipeById } from "@/lib/data/seed/recipes";
```

The store modules are `"use client"` — import them only from client components.
`selectors.ts`, `db.ts` and `storage.ts` are not, but `useHydrated()` is a React
hook, so call it from a client component.

---

## 2. Hydration pattern (required on every screen)

Stores persist to IndexedDB and rehydrate **asynchronously**, so the first client
render always sees empty state. Render a skeleton until `useHydrated()` is true —
it flips once *every* persisted store has rehydrated **and** demo seeding has
finished, and never flips back.

```tsx
"use client";
import { useHydrated } from "@/lib/data/storage";
import { usePantryStore } from "@/lib/data/stores";
import { Skeleton } from "@/components/ui";

export function PantryList() {
  const hydrated = useHydrated();
  const items = usePantryStore((s) => s.items);

  if (!hydrated) return <Skeleton className="h-40" />;
  if (!items.length) return <EmptyState … />;
  return …;
}
```

- `useHydrated()` returns `false` during SSR, so server and first client render agree.
- `HYDRATION_TIMEOUT_MS = 4000` (exported from `storage.ts`): if IndexedDB is
  unavailable (private mode, blocked storage) the gate opens anyway and the app
  runs on an in-memory map. The UI never hangs.
- `AppProviders` (`src/components/providers/AppProviders.tsx`) runs
  `ensureSeeded()` then `startSync()` on mount and wraps children in
  `ToastProvider`. Mount it once in `src/app/layout.tsx`.

Selecting state: always use a selector (`usePantryStore((s) => s.items)`), never
`usePantryStore()` — the whole-store subscription re-renders on every change.
Call actions through `getState()` in event handlers:
`usePantryStore.getState().consume("tomato", 200)`.

---

## 3. Stores

### `useProfileStore`

```ts
profile: UserProfile | null       // null until onboarding / seeding
setProfile(patch: Partial<UserProfile>): void   // creates a blank profile if none; bumps updatedAt
completeOnboarding(): void
reset(): void
userId(): ID                      // profile?.id ?? "demo-user"
setUserId(id: ID): void           // sync.ts swaps in the Supabase auth user id
isOnboarded(): boolean
```

`demoUserId` (`"demo-user"`) is exported from the same module. Onboarding steps
can call `setProfile({ name })`, `setProfile({ diet, allergies })`, … and finish
with `completeOnboarding()`.

### `useRecipeStore`

```ts
recipes: Recipe[]                 // catalog (RECIPES) + persisted user recipes
byId(id): Recipe | undefined
search(q, filters?: { mealType?; tag?; maxMinutes?; diet?; complete?; custom? }): Recipe[]
upsert(r: Recipe): void
remove(id): void
catalog(): Recipe[]               // isPublic only
reset(): void
```

`search` matches name, description, cuisine, tags and ingredient names.
Only non-public recipes are persisted, so catalog updates ship with the app.
`totalTimeMin(recipe)` is exported as a helper.

`complete: true` keeps only whole plates (`isCompleteMeal`, so staples such as rice and chapati are
out) and `custom: true` keeps only foods the user added. **Custom foods** are ordinary non-public
recipes: `buildCustomRecipe` (`engines/custom.ts`) makes one from the form, `upsert` saves it and
it is persisted and synced like any user recipe. `remove` deletes it; the My foods screen first
removes any still-planned meals that use it (`upcomingUses`) so the plan never points at a recipe
that is gone.

### `usePantryStore`

```ts
items: PantryItem[]
byId(id): PantryItem | undefined
add(input: { ingredientId; quantity; id?; name?; unit?; expiresAt?; source? }): PantryItem
addMany(inputs): PantryItem[]
update(id, patch: Partial<PantryItem>): void
remove(id): void
consume(ingredientId, grams): void     // FIFO by earliest expiry
expiring(withinDays = 3): PantryItem[] // includes already-expired, soonest first
totalGrams(ingredientId): number
has(ingredientId): boolean
reset(): void
```

- `name`, `unit`, `expiresAt` (`shelfLifeDays`) and `source` default from the
  ingredient catalog, so `add({ ingredientId: "tomato", quantity: 500 })` is enough.
- `consume` converts `pcs` rows via `gramsPerPiece` (fallback
  `DEFAULT_GRAMS_PER_PIECE = 100`), drains rows in expiry order and deletes rows
  that hit zero.
- Conversion helpers are exported from the same barrel:
  `toGrams(qty, unit, ingredientId)`, `fromGrams`, `pantryItemGrams(item)`,
  `gramsPerPieceFor(id)`.

### `usePlanStore`

```ts
plans: MealPlan[]; changes: ScheduleChange[]
planById(id): MealPlan | undefined
currentPlan(weekStart?): MealPlan | undefined      // defaults to this week (Monday)
mealById(mealId): PlannedMeal | undefined
planForMeal(mealId): MealPlan | undefined
generate(weekStart, opts?: { useAI?: boolean; seed?: number }): Promise<MealPlan>
upsertPlan(plan): void
swapMeal(mealId, recipeId): void       // keeps servings + lock, status -> "planned"
lockMeal(mealId, locked): void
updateMeal(mealId, patch): void
addMeal(planId, date, mealType, recipeId, servings): PlannedMeal | undefined
removeMeal(mealId): void
setStatus(mealId, status): void
applyChange(change: Omit<ScheduleChange,"id"|"userId"|"createdAt">): Promise<MealPlan>
reset(): void
```

- `generate` replaces the week's plan **in place** (same plan id, so grocery
  lists stay linked) and always carries locked meals over.
- With `{ useAI: true }` it POSTs to `/api/ai/meal-plan` and silently falls back
  to `generateWeekPlan` when offline, when the route is missing, on a non-2xx
  response, or on a malformed body. `seed` is accepted but the current
  heuristic planner is deterministic and ignores it.
- `applyChange` appends the `ScheduleChange` (id/userId/createdAt filled in) and
  replaces the plan with `adaptPlan(...)`, generating the week first if needed.
- `MEAL_ORDER` and `sortMeals(meals)` are exported for day rendering.
- **Leftovers.** A meal with `leftoverOf` re-serves a dish cooked for another meal. After every
  `updateMeal` / `swapMeal` / `removeMeal`, `generate` and `applyChange`, the store runs
  `sanitizeLeftovers`, so a link never points at a meal that changed or vanished. A leftover cut
  loose that way is re-picked with `fitMealsToSchedule` when its dish no longer fits a slot the
  user capped in `profile.timeSchedule`.

```ts
const plan = usePlanStore((s) => s.currentPlan());
await usePlanStore.getState().generate(weekStartOf(toISODate()));
await usePlanStore.getState().applyChange({ type: "less_time", date: toISODate(), availableMinutes: 20 });
```

### `useGroceryStore`

```ts
lists: GroceryList[]
byId(id) / forPlan(planId) / latest(): GroceryList | undefined
generateForPlan(planId): GroceryList
togglePurchased(itemId): void
setPurchased(itemId, purchased): void  // on a fresh item this ticks every trip
toggleVisit(itemId, date): void        // tick one shopping trip of a fresh item
moveToPantry(listId): PantryItem[]     // returns the rows actually added
remove(listId): void
reset(): void
```

`generateForPlan` rebuilds from `buildGroceryList` but keeps the same list id and
carries over `purchased` **and** `addedToPantry` per `ingredientId`, so a
half-shopped list survives a regenerate and nothing is added to the pantry twice.
`moveToPantry` adds purchased, not-yet-added items with `source: "grocery"` and
the catalog's default expiry, then flags them `addedToPantry`.

Fresh items (milk, meat, fish, herbs) carry `fresh.visits`, one per shopping trip, and each
trip has its own `purchased` / `addedToPantry`. `moveToPantry` adds **only the ticked trips**,
so Monday's milk does not arrive in the pantry together with Friday's, and a rebuilt list keeps
each trip's tick by its date.

### `useCookStore`

```ts
sessions: CookSession[]; activeId: ID | null
active(): CookSession | undefined
byId(id) / forRecipe(recipeId)
start(recipeId, servings, plannedMealId?): CookSession   // status "verifying"
resume(sessionId): CookSession | undefined
logIngredient(log: IngredientLog): void   // upsert by ingredientId
startStep(stepId): void                   // status -> "cooking", pushes a StepLog
endStep(stepId, summary?: Partial<StepLog>): void
addTemp(sample: TempSample): void
setRetention(est: RetentionEstimate): void
complete(): CookSession | undefined
logLeftover(mealId): CookSession | undefined   // eat a reheated leftover
abandon(): void
reset(): void
```

- `endStep` fills `endedAt`, `durationSec`, and `avgTempC`/`maxTempC` from the
  `temperatureHistory` samples inside the step's window (`TempSample.t` is ms
  since `session.startedAt`).
- `addTemp` caps the history at `MAX_TEMP_SAMPLES = 3000` by thinning the older
  half; recent samples are always kept.
- `complete()` sets `completedAt`, computes `retention` via `estimateRetention`,
  deducts the pantry **once** (`pantryDeducted`) using each ingredient's logged
  `actualGrams` — falling back to `recipeGrams × servings / recipe.servings` —
  marks the linked planned meal `cooked`, clears `activeId` and returns the session.
- `activeId` is persisted, so a refresh resumes the cooking flow. Only the last
  `MAX_SESSIONS = 50` sessions are kept.
- **Cook once, eat twice.** The Cook tab starts a dish that feeds leftovers with
  `cookServingsFor(plan, meal)` (its own servings plus every waiting leftover), so the scale
  targets and the pantry deduction cover the whole batch. `complete()` then records only the cook's
  own portion as eaten. `logLeftover(mealId)` later logs each leftover as a completed session of
  its own servings with `pantryDeducted: true`, marks the meal `cooked`, and touches nothing in
  the pantry. Each portion is counted in the day's intake exactly once.

### `useFeedbackStore` / `usePreferenceStore`

```ts
// feedback
feedback: MealFeedback[]
add(f: Omit<MealFeedback,"id"|"userId"|"createdAt">): MealFeedback  // also updates preferences
forRecipe(recipeId): MealFeedback[]
forSession(sessionId): MealFeedback | undefined
reset(): void

// preferences
model: PreferenceModel
apply(f: MealFeedback, recipe: Recipe): void
setUserId(id): void
reset(): void
```

`add` looks the recipe up in `useRecipeStore` and calls
`usePreferenceStore.getState().apply(...)`; if the recipe is unknown the
feedback is still stored, the model is just not updated.

---

## 4. Selectors (`@/lib/data/selectors`)

All pure; pass the slices you already subscribe to.

```ts
todaysMeals(plan, date?)                       : PlannedMeal[]   // ordered by meal type
nextMealToday(plan, date?, now?)               : PlannedMeal | undefined
dailyIntake(sessions, recipes, date?)          : DailyIntake
dailyIntakeFromPlan(plan, recipes, date?)      : DailyIntake     // from meals marked "cooked"
weeklyKcalProgress(sessions, recipes, weekStart, dailyTarget): WeeklyKcalProgress
expiringSummary(pantry, days = 3)              : { items, count, soonest?, label }
recipesUsingExpiring(recipes, pantry, days = 3): { recipe, expiringUsed }[]   // most used, then quickest
pantryCoverage(recipe, pantry, servings?)      : { ingredientId, name, needGrams, haveGrams, ok, optional }[]
expiringUsageStats(sessions, pantry?, opts?)   : { used, total, label }
goalLabel(profile)                             : "Muscle gain + improve energy"
profileSubtitle(profile)                       : "20 years • Chennai, India"
MEAL_ORDER, toGrams, fromGrams, pantryItemGrams, gramsPerPieceFor
```

`dailyIntake` sums `recipe.nutritionPerServing × servings` for sessions completed
that calendar day; a session's `retention` estimate is deliberately **not**
applied (retention has its own screen, discounting the calorie goal would confuse).

`expiringUsageStats` is best effort: the app keeps no pantry history, so "was
this item expiring when it was cooked?" is approximated against the pantry **as
it is now**. Items that were expiring and got fully used up have left the pantry
and are counted in neither `used` nor `total`, so the ratio is conservative.

---

## 5. Demo seeding

`ensureSeeded()` (called by `AppProviders`) is idempotent — guarded by the kv
flag `seed:v1` — runs only in the browser, and only after every store rehydrated.
It creates:

- **Profile** — Santhosh, 20, `city: "Chennai, India"` (the type has no country
  field), male, 172 cm, 65 kg, non-vegetarian, muscle gain, 2500 kcal / 130 g
  protein, equipment stove·mixer·pressure cooker·frying pan·dosa pan, favourites
  dosa·biryani·egg bhurji, cuisines south/north Indian, spice 2, ₹5,000/month,
  beginner, time "varies", priorities nutrition→budget→time→taste→waste, 2
  servings, `onboardingComplete: true`, plus the weekly cooking-time grid he described
  (`DEMO_TIME_SCHEDULE`: Monday and Wednesday mornings 20 min, Wednesday lunch and Thursday
  morning 10 min, Friday lunch 30 min, everything else free).
- **Pantry** — the mockup rows with expiry relative to today: Tomato 500 g (2 d),
  Onion 1 kg (5 d), Eggs 6 pcs (7 d), Chicken 500 g (3 d), Spinach 200 g (3 d),
  Milk 1 L (4 d), Rice 1 kg (45 d), Coconut 1 pc (7 d).
- **Plan** — the current week via `generateWeekPlan`, planned *around* today's
  meals: `ragi-dosa` / `chicken-biryani` / `egg-bhurji` go in as locked meals first (so their
  cost counts against the budget), then are unlocked. A mockup dish is pinned only if the recipe
  exists **and fits the profile's schedule for that meal** (a 20-minute dosa is not forced onto a
  "very little time" morning; the planner's own pick stays). Breakfast and lunch are marked
  `cooked`, so `nextMealToday` returns **Egg Bhurji** on Home, as in the mockup. Dinner has no
  time limit on any day, so that holds every day of the week.
- **Cook sessions** — completed sessions for those two cooked meals (written
  directly with `pantryDeducted: true`, so the seeded pantry keeps exactly the
  mockup quantities) so Home's kcal ring and `expiringUsageStats` have data.
- **Grocery list** — `generateForPlan(plan.id)`.

`resetDemoData()` (Profile → settings sheet) clears the Dexie `kv` table, resets
every store and seeds again.

---

## 6. Supabase sync

`startSync()` returns a disposer and is a **no-op** when `isSupabaseConfigured()`
is false or no user is signed in. On an auth session it re-keys local rows from
`demo-user` to the auth user id, pulls the user's rows (newer `updated_at` wins),
then subscribes to each store and pushes changed rows as debounced upserts
(`PUSH_DEBOUNCE_MS = 500`). Rows that disappear locally are deleted remotely.
Every failure is `console.warn`-ed; nothing throws into the UI.

### Assumptions to reconcile with `supabase/migrations/0001_init.sql`

| Store | Table | Owner column | Upsert conflict target | `updated_at` used for merge |
|---|---|---|---|---|
| profile | `profiles` | `id` | `id` | `updated_at` |
| pantry | `pantry_items` | `user_id` | `id` | `updated_at` |
| recipes (user-created only) | `recipes` | `created_by` | `id` | — (remote never overwrites local) |
| plan | `meal_plans` | `user_id` | `id` | `updated_at` |
| plan changes | `schedule_changes` | `user_id` | `id` | `created_at` |
| grocery | `grocery_lists` | `user_id` | `id` | `updated_at` |
| cook | `cook_sessions` | `user_id` | `id` | `completed_at ?? started_at` |
| feedback | `meal_feedback` | `user_id` | `id` | `created_at` |
| preferences | `preference_models` | `user_id` | `user_id` | `updated_at` |

- Top-level columns are the snake_case of the camelCase field in `types.ts`
  (`proteinTargetG` → `protein_target_g`, `vitaminCMg` → `vitamin_c_mg`); the
  mapping is generic (`snakeKey`/`camelKey` in `sync.ts`), not a hand-written list.
- Nested arrays/objects are single `jsonb` columns (`meals`, `items`,
  `ingredients`, `steps`, `ingredient_logs`, `step_logs`, `temperature_history`,
  `nutrition_per_serving`, `retention`, `recipe_scores`, `ingredient_affinity`,
  `cuisine_affinity`, `tag_affinity`) and **their inner keys stay camelCase**,
  exactly as in `types.ts`.
- `Recipe` has no `updatedAt`; add one to the table if you want remote recipe
  edits to win, then update `sync.ts`'s `recipes` entity `stamp`.

---

## 7. Tests

`npx vitest run src/lib/data` — covers pantry FIFO/pcs conversion, plan
generate/lock/swap/adapt, grocery purchase → pantry, cook `complete()` deducting
the pantry exactly once, feedback → preferences, and the selectors. The engine
modules are mocked in the store tests so they assert store behaviour, not engine
maths. Config lives in `vitest.config.mts` (must be `.mts`: the package is CJS
and vitest cannot `require()` an ESM `.ts` config).
