# Cookwise engines

Pure TypeScript, no React, no I/O, no browser globals at module scope — everything in
`src/lib/engines/**` is deterministic and unit-tested (`npm test` → `vitest run`).

| File | Purpose |
|---|---|
| `constants.ts` | Every tunable number: priority weights, kcal splits, pack sizes, allergen tokens, mood specs. |
| `helpers.ts` | `daysBetween`, `mulberry32`, `hashSeed`, `ema`, `mean`, `ceilTo`, `round`, `roundToHalf`, `normalizeText`, `words`, `matchesToken`. |
| `filters.ts` | Hard diet / allergy / dislike / equipment filters, shared by the planner and the recommender. |
| `nutrition.ts` | Arithmetic over `Ingredient.nutrition` (per-100 g) → absolute dish totals → per-serving. |
| `planner.ts` | `generateWeekPlan`, `adaptPlan`, `scoreRecipe`, `explainMeal`, `diffPlans`, `slotTimeLimit`, `simplicityFit`, `isBatchable`, `fitMealsToSchedule`. |
| `schedule.ts` | The weekly cooking-time grid: `scheduleCell`, `setScheduleCell`, `materializeSchedule`, `nextSlotTime`, `rushedMealCount`. |
| `leftovers.ts` | `sanitizeLeftovers` — keeps `PlannedMeal.leftoverOf` links honest after any edit. |
| `freshness.ts` | `freshnessFit`, `freshBuyEveryDays`, `planFreshVisits` — early spoilers first, and buying milk or meat in trips. |
| `grocery.ts` | `buildGroceryList`, `groceryTotals`, `uncoveredNeeds`, `shortfall`, `packSizeFor`, `pendingPantryCount`. |
| `retention-factors.ts` | The USDA-style factor table and the kinetics constants. |
| `retention.ts` | `estimateRetention`, `liveRetentionHint`, `computeNutritionFromLogs`. |
| `learning.ts` | `applyFeedback`, `recommend`, `spiceTargetFor`, `emptyPreferenceModel`. |
| `sensor.ts` | `SimulatedSensorDock`, `WebBluetoothDock`, `createSensorDock`. |

---

## 1. Planner — `planner.ts`

### `generateWeekPlan(req, recipes, opts?)`

Fills 7 days × (breakfast, lunch, dinner) from `req.weekStart` (a Monday), greedily,
slot by slot in calendar order.

**Hard filters** (`filters.ts` — a recipe failing any of these is never offered):

- **Diet** — `recipe.diets` must intersect the accepted set for `profile.diet`.
  Vegan ⊂ vegetarian ⊂ eggetarian/pescatarian ⊂ non-vegetarian, so a vegan recipe is fine
  for a vegetarian but not the reverse.
- **Allergies** — free-text labels are expanded to ingredient tokens
  (`eggs → egg`, `dairy → milk/curd/paneer/ghee/butter/cheese/…`, `nuts → peanut/cashew/almond/…`,
  `gluten → wheat/maida/bread/pasta/semolina/rava/…`, `shellfish → prawn/shrimp/crab/…`,
  `soy → soya/tofu/soybean`) and matched **word-wise** against ingredient ids and names, so
  `egg` matches "Eggs" but not "eggplant". An unrecognised label is used as a token verbatim.
- **Disliked ingredients** — same token matcher over `profile.dislikedIngredients`.
- **Equipment** — `recipe.equipment ⊆ profile.equipment`, except that `stove`, `frying_pan`,
  `kadai` and `tawa` are treated as one interchangeable basic hob-and-pan setup.
- **Slot** — `recipe.mealTypes` must include the slot's meal type. (If that leaves no
  candidate at all the slot requirement is relaxed rather than leaving a hole in the week.)

**Soft score** — five components, each normalised to 0–100, combined with weights taken from
the *order* of `profile.priorities`: 1st = 0.35, then 0.25, 0.2, 0.12, 0.08 (weights sum to 1;
unranked priorities are back-filled in the default order).

| Component | Formula |
|---|---|
| **nutrition** | `0.55·kcalScore + 0.45·proteinScore + goalBonus`, where the slot target is `dailyCalorieTarget × split` (breakfast 0.25 / lunch 0.40 / dinner 0.35), `kcalScore = 100·exp(−½((kcal−target)/(0.35·target))²)` and `proteinScore = 100·min(1, protein/proteinTarget)`. Goal bonus: `muscle_gain` +15 `high_protein`; `weight_loss` +10 `low_cal` +5 `high_fiber`; `improve_energy` +10 for oats/banana/ragi/millet/rice-type ingredients +4 `high_fiber`; otherwise +5 `high_fiber` / +5 `high_protein`. |
| **time** | Limit = 20 / 35 / ∞ min for `low` / `medium` / `high`; `varies` → 30 min Mon–Fri, ∞ at weekends. Inside the limit `100 − 40·(total/limit)` (60–100); over it `60 − 2.5·(total − limit)`, floored at 0. |
| **budget** | Weekly allowance `budgetMonthly / 4.3`. Per-meal allowance = remaining budget ÷ remaining slots. Cost = `costPerServing × servings`. At or under allowance `100 − 25·(cost/allowance)` (75–100); over it decays linearly to 0; a meal that would push the running total past the weekly budget scores **0**. |
| **waste_reduction** | Grams of pantry stock expiring within 4 days that the recipe uses *and* that the meal is scheduled **on or before** the expiry date. `100·min(1, covered/250 g)`, multiplied by `0.75 + 0.35·urgency` where `urgency = 1/(1 + days left)`. Claimed grams are deducted so later days do not re-claim the same stock. |
| **taste** | Base 40, +18 cuisine ∈ `profile.cuisines`, +18·max(0, 1 − |spiceΔ|/2.5) where the target is `spiceLevel + 2·spiceAdjust`, +12 fuzzy `favoriteFoods` match on the recipe name, +20·recipeScore, +8·cuisineAffinity, +8·mean tagAffinity, +8·mean ingredientAffinity (all `PreferenceModel` terms clamped to −1..1). |

**Variety penalty** (subtracted from the weighted total): the same recipe within 3 days costs
`40 − 10·gap` points; each earlier meal that day sharing the `primaryMethod` costs 10 and each
sharing the `cuisine` costs 6.

**Determinism** — up to 6 points of jitter from a `mulberry32` PRNG seeded with
`hash(weekStart | userId | seed)`. Same inputs → identical plan; pass `opts.seed` ("Regenerate")
for a different but equally reproducible one. `opts.ingredients` supplies the catalog so `pcs`
pantry quantities convert to grams; `opts.today` overrides the reference date for "expiring soon".

**Servings** = `servingsDefault × (preferences?.portionAdjust ?? 1)`, rounded to the nearest 0.5,
minimum 1. `generatedBy` is always `"heuristic"`. Locked meals from `req.lockedMeals` that fall
inside the week are kept verbatim (only `planId` is re-pointed at the new plan) and their slots
are not re-filled.

#### Per-meal cooking time

`UserProfile.timeSchedule` is an optional grid of `day → meal → level`, where the level is
`very_little` (10 min), `little` (20), `some` (30) or `plenty` (no limit). `slotTimeLimit` returns the
minutes a slot allows: the grid cell when the user set one, otherwise the single
`timeAvailability` setting. A cell the user set is a **hard rule**. Only recipes that fit are
offered for that slot; if none of the right meal type fit, any allowed recipe that does is offered
(a quick breakfast dish at a rushed lunch); if still none, the three fastest. Slots with no cell
are scored softly as before.

#### Simple dishes

For beginners (`skill`) the time score blends in `simplicityFit`: easy beats hard, and fewer than
8 ingredients and 6 steps score best. The blend weight is `SIMPLICITY_WEIGHT[skill]`
(0.35 beginner, 0.15 intermediate, 0 advanced).

#### Cook once, eat twice

A recipe tagged `batch_friendly` that takes 30 minutes or more can be cooked once for two meals.
When one is picked at lunch or dinner and the next lunch or dinner (at most a day later) is free,
that meal becomes a **leftover**: same recipe and servings, `leftoverOf` pointing at the cooked
meal, reheated in 5 minutes. Nothing is cooked for it, and `scoreRecipe` gives batch dishes
`+4`, or `+14` when that next meal is rushed (under 30 minutes), so a rushed lunch is usually a
reheated dinner. The generator also **saves a relaxed meal for a rushed one**: if the next meal
could itself host a leftover for an even more rushed meal after it, it is not spent here.
Locked meals are never used as a leftover slot.

`sanitizeLeftovers` drops a `leftoverOf` link when the source meal is gone, skipped, eating out,
changed recipe or is not earlier. The data stores call it after every edit. A leftover cut loose
that way now has to be cooked, so `fitMealsToSchedule` re-picks it if its dish no longer fits a
slot the user capped.

#### Early spoilers first

With `opts.ingredients`, each recipe gets `freshnessFit`: every perishable ingredient (shelf
life up to 7 days, not one bought fresh anyway) scores 100 when used straight after the weekly
shop, 70 on its last good day and falls steeply after. Shorter-lived items count for more. The
result adds up to ±12 points (`FRESHNESS_POINTS`), so short-lived dishes land early in the week.
Items that must be re-bought (below) are exempt. A small `VARIETY_WEEK_REPEAT_PENALTY` also
stops the week falling into a four-day cycle.

#### Whole plates and the budget ceiling

A curry is a dish, not a lunch, so lunch and dinner should be a whole plate. `isCompleteMeal`
(see §6) is true for a recipe tagged `complete_meal` or one with 50 g of carbs a serving. Three
rules follow.

- **Staples are never planned alone.** `isStaple` recipes (rice, chapati) are dropped by
  `isPlannable`, in the generator and in `recommend`.
- **Prefer whole plates.** At lunch and dinner `scoreRecipe` subtracts `INCOMPLETE_MEAL_PENALTY`
  (30) from a recipe that is not a whole plate, shown as `parts.incomplete`. The penalty is
  waived for the light moods (`light`, `no_cooking`, `healthy`), where a soup or salad is the
  point. When the catalog offers at least `MIN_WHOLE_PLATE_CHOICES` (5) whole plates for a slot,
  only those are considered, so a bare curry is never picked over a plate that fits.
- **The budget is a ceiling.** `BUDGET_CEILING` is 1, so the plan never costs more than the weekly
  budget. Each slot may spend only what is left after reserving the cheapest meal for every
  slot still empty (`cheapestMeal`), and `affordableOnly` drops what does not fit. A batch dish
  is priced as two portions less the cost of the leftover slot it replaces.

Chapati plates take 25 to 30 minutes longer than rice plates, so a rushed slot still gets the
rice version or a quick dish.

### `adaptPlan(plan, change, ctx)`

Only meals **on or after `change.date`**, not `locked`, and still `planned` may change. The
change applies to `change.mealType` when given, otherwise to the whole day (`skip_meal` and
`eating_out` default to dinner).

| `ScheduleChangeType` | Behaviour |
|---|---|
| `skip_meal` | Removes the meal from the plan. |
| `eating_out` | Sets `status: "eating_out"`. If `goal === "weight_loss"`, the day's other editable meals are re-picked under a kcal cap of `slotTarget × 0.8`, biased toward `low_cal` / `high_fiber`. |
| `guests` | `servings × (1 + guestCount / servingsDefault)`, rounded to 0.5, and swaps to a `guest_friendly` recipe when one exists. |
| `less_time` | Re-picks any meal whose `prepTimeMin + cookTimeMin` exceeds `availableMinutes`, preferring recipes that fit and biasing the `quick` tag. A leftover is left alone: reheating fits any limit of 5 minutes or more. |
| `mood_change` | Biases tags and applies the mood's predicate: `light → low_cal/high_fiber`, `comfort → comfort/one_pot`, `spicy → spiceLevel ≥ 3`, `no_cooking → prep+cook ≤ 10 min or raw`, plus `mild`, `quick`, `healthy`, `protein`, `budget`. |

### `diffPlans(before, after)`

Matches meals by id, falling back to `date|mealType`, and reports only real changes:
`{ mealId, date, mealType, fromRecipeId?, toRecipeId?, fromServings?, toServings?, statusChange? }`,
plus removals (only `from…`) and additions (only `to…`), sorted by date then slot.

### Explainability

`scoreRecipe(recipe, slot, ctx)` returns `{ total, parts }` with every component plus
`expiringItems` / `expiringGrams`, `freshness` / `freshItems` and `batch`;
`explainMeal(recipe, slot, ctx)` renders the top three as one
line — *"Uses 2 items expiring soon · high protein · 20 min"*.

---

## 2. Grocery — `grocery.ts`

`buildGroceryList(plan, recipes, pantry, ingredients)`

1. For each meal still `planned`, add `ingredient.grams × (meal.servings / recipe.servings)` to
   that ingredient's requirement list, tagged with the meal date. A **leftover** is tagged with
   the day its dish is *cooked*, and asks for nothing once that dish has already been cooked.
2. Convert pantry rows to grams (`pcs × gramsPerPiece`, fallback 50 g; `ml ≈ g`) into lots
   carrying their expiry.
3. `uncoveredNeeds()` walks the requirements in date order and consumes lots **FIFO by expiry**,
   skipping any lot that expires *before* the meal date — food that goes off on Tuesday cannot
   feed Thursday's dinner. It returns what is left, still dated; `shortfall()` sums it.
4. **Fresh items** (`freshBuyEveryDays`: milk daily, coriander and mint every 2 days, and
   anything whose shelf life is 3 days or less, such as chicken, fish and spinach) are not rounded
   to a pack. `planFreshVisits` splits the uncovered need into shopping trips, one on the first day
   it is needed and covering the following `everyDays - 1` days, each rounded up to 50 g / ml. The
   item carries `fresh: { everyDays, visits }` and the list ticks each trip on its own.
5. Everything else rounds the uncovered grams up to a pack size: spices/salt 50 g, oils 200 ml,
   grains / flours / dals / legumes 500 g, vegetables 100 g, proteins 250 g, dairy 500 g-ml
   (butter 100 g, paneer and cheese 200 g), fruits & nuts 100 g, other 100 g. `pcs` items round up
   to whole pieces.
6. `estimatedCost = grams / 1000 × costPerKg`; `unit` comes from the catalog. `usedCost` is the
   same sum over the uncovered grams *before* rounding: what this week's meals actually consume
   of the list. Lines with need ≤ 0 are skipped. Items are sorted by name.

`groceryTotals(list)` → `{ itemCount, purchasedCount, totalGrams, estimatedCost, usedCost, purchasedCost, remainingCost }`.
`usedCost` is why a first-week shopping list can look far above a weekly budget: rice, oil and
spices bought in packs last into later weeks, so only part of the list is eaten this week.
`pendingPantryCount(list)` counts ticked
purchases not yet in the pantry, one per ticked trip of a fresh item.

---

## 3. Nutrient retention — `retention.ts` + `retention-factors.ts`

Two layers.

**Layer 1 — method.** `BASE_RETENTION[method][nutrient]` approximates the
**USDA Table of Nutrient Retention Factors, Release 6 (2007)**: the share of a nutrient that
survives a cooking method before any allowance for time or temperature. Examples —
boil: vitC 0.55, folate 0.60, B6 0.70, A 0.90, protein 0.95, fat 0.95, iron 0.85, calcium 0.90,
fiber 1.00; steam: vitC 0.80, folate 0.85, B6 0.85; sauté: vitC 0.70, folate 0.75, B6 0.85,
A 0.85, fat 0.90; stir-fry vitC 0.75; deep-fry vitC 0.60, fat 0.85 (stands in for oil uptake),
protein 0.90; pressure cook vitC 0.60, folate 0.70; microwave vitC 0.85; simmer vitC 0.65;
bake/roast/grill vitC 0.65, folate 0.70, protein 0.92 (charring); raw 1.00.

**Layer 2 — kinetics.** Per heat step, first-order thermal degradation:

```
R *= exp(−k(T) · Δt_min)          k(T) = k_ref · Q10^((T − 100) / 10)
```

`k_ref` (per minute at 100 °C): vitamin C 0.010, folate 0.007, B6 0.004, vitamin A 0.003;
protein, fat, iron, calcium and fiber are 0, so they move only with the base factor.
`Q10` = 2.0 for the water-soluble vitamins (van 't Hoff), 1.5 for vitamin A.

- **Temperature** per step: `stepLog.avgTempC` → mean of `temperatureHistory` inside the step's
  window (the window is derived from `stepLog.startedAt/endedAt` relative to the earliest step
  log) → midpoint of `step.targetTempC` → the method default (boil 100, sauté 150, stir-fry 180,
  deep-fry 180, bake 180, roast 200, grill 220, pressure cook 115, microwave 100, raw 25 °C).
- **Duration** per step: `stepLog.durationSec` → `endedAt − startedAt` → `step.durationSec`.
- **Exposure**: `step.addIngredients` determines when each ingredient enters the pan; an
  ingredient only takes the base factor of the first heat step it is present for, and only the
  kinetics of the steps at or after it. Ingredients not named in any step are present from the
  start. A recipe with no steps is treated as one step of `recipe.primaryMethod` lasting
  `cookTimeMin`.

**Aggregation.** Each nutrient is weighted by how much of it the dish actually contains —
`ingredientLogs.actualGrams` where the scale measured it, otherwise recipe grams scaled to the
cooked servings — so the reported figure is content-weighted, not a plain average.
A nutrient whose per-serving content is below **2 % of a typical daily value**
(vitC 90 mg, B6 1.7 mg, folate 400 µg, A 900 µg, protein 50 g, fat 70 g, iron 18 mg,
calcium 1000 mg, fiber 28 g) is omitted entirely.

**Overall** = weighted mean with vitC 0.25, folate 0.15, B6 0.15, A 0.10, protein 0.20, fat 0.05,
iron 0.05, calcium 0.025, fiber 0.025, **renormalised over the nutrients actually shown**.

**Notes** (mockup tone): ≥ 0.90 "Well preserved." · ≥ 0.75 "Good retention!" ·
≥ 0.60 and every step inside its target range "Optimal temperature." ·
otherwise "Some loss due to heat. Consider shorter cooking time."

**Warnings**: a nutrient below 60 % → `warn`, below 40 % → `critical`; a pan-fry step whose
`maxTempC` exceeds 180 °C; anything past 200 °C (charring, an `info` warning on protein);
a step that ran longer than 1.5× its planned duration.
**Tips** are 2–3 strings, always led by
*"Cooking at medium heat helps retain more vitamins. Avoid overcooking."*

> Worked example — 200 g spinach, boiled 10 min at 100 °C:
> `0.55 · exp(−0.010 × 10) = 0.4977` → **50 % vitamin C**.

### Live coaching

`liveRetentionHint(step, currentTempC, elapsedSec)` → `{ tone, message }`:

- `ok` inside `targetTempC` — *"Keep temperature between 120°C – 150°C for better nutrient retention."*
- `warn` above `max` (by ≤ 20 °C) or past 1.25× the planned duration
- `danger` above `max + 20 °C` (*"Too hot — lower the flame to protect vitamin C."*) or past
  1.6× the duration (*"Onions has cooked 2 min longer than planned; move on to the next step."*)

### Actual cooked nutrition

`computeNutritionFromLogs(recipe, ingredients, logs, servings)` → `NutritionPerServing`, using
measured grams where the dock logged them. The home and feedback screens use it for daily intake.

---

## 4. Learning — `learning.ts`

Every rating nudges the model with an exponential moving average, **α = 0.3**:
`new = old + α·(target − old)`, clamped to −1..1.

- `recipeScores[recipe.id]` moves toward `(rating − 3) / 2`.
- `ingredientAffinity`, `cuisineAffinity`, `tagAffinity` move toward a blend
  `0.6·rating + 0.4·taste` (also mapped through `(x − 3)/2`), because taste is the better signal
  for *what* was in the dish.
- `spiceAdjust`: `too_hot` −0.2, `too_mild` +0.2, `just_right` decays ×0.9 back toward the
  profile; clamped −1..1. `spiceTargetFor(profile, model) = round(spiceLevel + 2·spiceAdjust)`
  clamped to 1..5.
- `portionAdjust`: `too_little` ×1.1, `too_much` ×0.9; clamped 0.6..1.6.

All updates are immutable — new record objects, `feedbackCount + 1`, fresh `updatedAt`.

`recommend(recipes, model, profile, n)` applies the same hard filters as the planner, then sorts by

```
0.5·recipeScore + 0.2·mean(ingredientAffinity) + 0.15·cuisineAffinity + 0.15·mean(tagAffinity)
```

with ties broken on recipe name so the order is stable between renders.

---

## 5. Sensor dock — `sensor.ts`

`createSensorDock(kind)` returns `SimulatedSensorDock` (default) or `WebBluetoothDock`.
Nothing reads `window` / `navigator` at module scope, so the module is safe to import from a
server component.

### `SimulatedSensorDock`

Emits a `SensorReading` every **200 ms** while connected.

- **Weight** eases toward `target`: each tick closes **35 %** of the gap, and the *reported*
  value carries ±0.3 g of noise (the internal value stays clean). `stable` flips true once
  `|target − weight| < 0.5 g` for **4 consecutive ticks**. `tare()` stores the current smoothed
  weight as an offset so the pan reads 0 g; `simulateAdd(g)` raises (or lowers) the target and
  clears the stable flag.
- **Temperature** approaches the burner setpoint first-order with a time constant of **8 s**:
  `T += (setpoint − T)·(Δt/8)`. Setpoints by level are `[25, 90, 120, 150, 200] °C`; level 0 is
  off and cools back to the 25 °C ambient. `getBurner()` reports the current level.
- The noise generator is seedable (`new SimulatedSensorDock({ seed })`) so tests are reproducible;
  `read()` returns the latest value without waiting for a tick.

### `WebBluetoothDock`

`connect()` rejects with
`"Web Bluetooth is not available on this device. Using the simulator instead."`
when `navigator.bluetooth` is missing. Otherwise it requests a device filtered on the Bluetooth
SIG **Weight Scale** service `0x181D`, subscribes to the **Weight Measurement** characteristic
`0x2A9D` and parses notifications with this **assumed protocol** (little-endian, 6–7 bytes):

| Bytes | Type | Meaning |
|---|---|---|
| 0–3 | `int32` | weight in grams |
| 4–5 | `int16` | pan temperature × 10 °C |
| 6 | `uint8` | flags — bit 0 = weight stable (optional) |

A 4-byte payload is read as weight-only and assumed stable. The reference dock has no tare
command, so `tare()` zeroes in software against the last raw reading. `parseDockPayload(view)` is
exported so the protocol can be unit-tested without hardware.

---

## 6. Complete meals and custom foods — `meals.ts`, `custom.ts`

Pure modules. A complete meal is an ordinary `Recipe`, so the planner, grocery list, cooking mode
and retention model need no special case for it.

### `meals.ts`

- `isStaple(recipe)` — tagged `staple`.
- `isCompleteMeal(recipe)` — never for a staple; true for the `complete_meal` tag or
  `COMPLETE_MEAL_MIN_CARBS_G` (50) g of carbs per serving.
- `isPlannable(recipe, profile)` — allowed for the profile and not a staple.
- `stapleTiming(staple)` — how it fits beside a main dish. A passive method (boil, simmer, steam,
  pressure_cook) starts first and adds no time (`first`, `alongside`). Anything else, such as
  chapati on a tawa, comes last and its time is added.
- `scaleAmounts(text, factor)` — rewrites the `g` and `ml` amounts in a step's wording.
- `composeMeal(main, parts, opts)` — joins a main dish and its parts into one recipe. Servings are
  the main dish's. Each part is scaled by `servings / part.servings`. Ingredients are merged,
  steps are ordered first-parts, main, rest with part steps titled `"Chapati: Roll the chapatis"`,
  prep is summed, cook time is the sequential time or the longest alongside part, nutrition and
  cost are summed, diets are the intersection, and the tags gain `complete_meal` and lose `staple`,
  `low_cal` and (past 20 minutes) `quick`.

### `custom.ts`

Turns what a user typed into a recipe, so a custom food is as trustworthy as a built-in one.

- `validateCustomFood(input)` — what is wrong, in the user's words; empty means it can be saved.
- `buildCustomRecipe(input, catalog)` — nutrition from `nutritionFromGrams`, cost from
  `costPerKg`, diets from `dietsFor`, tags (`complete_meal`, `staple`, `high_protein`, `quick`,
  `budget`), and three steps: weigh and prepare (every ingredient is added), cook (with the method's
  temperature window from `METHOD_TEMP_C`, or "Mix" for raw) and serve. A `dish` given `serveWith`
  staples is run through `composeMeal`, with "Serve" moved after the staple's steps.
- `customFoodFromRecipe(recipe, userId)` — reads a saved food back into form values. A food saved
  with a staple comes back as one complete meal with every ingredient listed, and saving it
  rebuilds the steps.
- `CustomKind` is `meal` (a whole plate), `dish` (needs rice or chapati) or `side` (a staple).

## 7. Tests

`npm test` (→ `vitest run`, config at `vitest.config.ts`, `@/` aliased to `./src`).
Engine specs live in `src/lib/engines/__tests__/` and use their own fixtures
(`fixtures.ts`) rather than `src/lib/data/seed/*`, so they stay stable while the catalog grows.
`meals.test.ts` and `custom.test.ts` cover composition, scaling and building a custom food;
`src/lib/data/__tests__/complete-meals.test.ts` checks that lunch and dinner are whole plates across
diets and seeds, that no staple is planned alone and that the budget ceiling holds.

## Food-temperature correction (added during integration)

The kinetics use the temperature of the **food**, not the pan. Water-rich food stays near 100 °C until it dries out, so `effectiveFoodTempC(pan) = min(140, 100 + 0.25·(pan − 100))` for pan temperatures above 100 °C (unchanged below). Without it a 190 °C stir-fry would pin every heat-labile vitamin to the floor within a minute. The Python service applies the identical `effective_food_temp_c()`.
