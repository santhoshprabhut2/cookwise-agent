/**
 * Prompt builders for the `/api/ai/*` routes.
 *
 * Rules that apply to all of them:
 * - The catalog / recipe list is embedded verbatim so the model can only
 *   return ids that exist. Routes still post-validate the ids.
 * - Compact, line-oriented formatting (not JSON) keeps the token count low
 *   and is easier for the model to scan than deeply nested objects.
 * - Indian home cooking is the default context (grams, rupees, regional names).
 */

import { SCHEDULED_MEAL_TYPES, SLOT_TIME_MIN, WEEKDAY_KEYS } from "@/lib/engines/constants";
import { addDays } from "@/lib/utils";
import type {
  AiAdaptRequest,
  AiMealPlanRequest,
  CatalogEntry,
  CookingStateRequest,
  RecipeSummary,
} from "./schemas";

const MAX_CATALOG = 400;

function catalogBlock(catalog: CatalogEntry[]): string {
  if (catalog.length === 0) return "(no catalog supplied — leave ingredientId empty)";
  return catalog
    .slice(0, MAX_CATALOG)
    .map((c) => `${c.id}\t${c.name}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// identify
// ---------------------------------------------------------------------------

export function identifyPrompt(catalog: CatalogEntry[]): string {
  return [
    "Identify the single main food ingredient in the photo.",
    "",
    "CATALOG (id<TAB>name) — `ingredientId` MUST be one of these ids, or \"\" when nothing fits:",
    catalogBlock(catalog),
    "",
    "Guidance:",
    "- Indian kitchen context: prefer regional names in the catalog (e.g. \"kadai\" produce, dals, paneer).",
    "- `name` is the display name for the ingredient, capitalised (\"Tomato\", \"Toor dal\").",
    "- `estimatedGrams`: judge the visible quantity against everyday references",
    "  (a medium tomato ≈ 100 g, an onion ≈ 120 g, an egg ≈ 50 g, a cup of rice ≈ 180 g).",
    "  Use 0 when you cannot tell.",
    "- `alternatives`: up to 3 other catalog matches, most likely first.",
    "- If the photo shows several ingredients, pick the one occupying the most frame",
    "  and list the others as alternatives.",
    "- Never return an id that is not in the catalog.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// receipt
// ---------------------------------------------------------------------------

export function receiptPrompt(catalog: CatalogEntry[]): string {
  return [
    "Read this grocery receipt and extract every food line item.",
    "",
    "CATALOG (id<TAB>name) — map each line to one of these ids when you can, else \"\":",
    catalogBlock(catalog),
    "",
    "Guidance:",
    "- Prices are Indian rupees. Use 0 when a price is not printed.",
    "- Normalise quantities: \"1 kg\" -> quantity 1000 unit g; \"500ml\" -> 500 ml;",
    "  \"6 nos\"/\"1 dozen\" -> pcs. Loose produce priced by weight is g.",
    "- When only a price is printed and no quantity, estimate quantity 1 pcs.",
    "- Skip non-food lines (bags, taxes, discounts, loyalty points) and the totals row.",
    "- `store` is the shop name at the top of the receipt, \"\" when unreadable.",
    "- `total` is the printed grand total in rupees, 0 when unreadable.",
    "- Never invent items that are not on the receipt.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// meal plan
// ---------------------------------------------------------------------------

function recipeLines(recipes: RecipeSummary[]): string {
  return recipes
    .map((r) =>
      [
        r.id,
        r.name,
        r.mealTypes.join("/") || "any",
        r.tags.join(",") || "-",
        `${Math.round(r.kcal)}kcal`,
        `${Math.round(r.protein)}gP`,
        `${Math.round(r.minutes)}min`,
        `₹${Math.round(r.cost)}`,
        r.diets.join(",") || "-",
      ].join("\t"),
    )
    .join("\n");
}

/**
 * The meals the user has capped, as one line, e.g. "mon breakfast 20 min, wed
 * lunch 10 min". Unlimited meals are left out. `undefined` when none are capped.
 */
export function timeLimitsLine(profile: AiMealPlanRequest["profile"]): string | undefined {
  const parts: string[] = [];
  for (const day of WEEKDAY_KEYS) {
    for (const meal of SCHEDULED_MEAL_TYPES) {
      const level = profile.timeSchedule?.[day]?.[meal];
      if (level && Number.isFinite(SLOT_TIME_MIN[level])) {
        parts.push(`${day} ${meal} ${SLOT_TIME_MIN[level]} min`);
      }
    }
  }
  if (parts.length === 0) return undefined;
  return `cooking time limits, prep plus cook, strict (every other meal is unlimited): ${parts.join(", ")}`;
}

function profileBlock(profile: AiMealPlanRequest["profile"]): string {
  const limits = timeLimitsLine(profile);
  return [
    `name: ${profile.name || "the cook"}`,
    `diet: ${profile.diet}`,
    `goal: ${profile.goal}`,
    `daily targets: ${profile.dailyCalorieTarget} kcal, ${profile.proteinTargetG} g protein`,
    `allergies: ${profile.allergies.join(", ") || "none"}`,
    `restrictions: ${profile.restrictions.join(", ") || "none"}`,
    `disliked ingredients: ${profile.dislikedIngredients.join(", ") || "none"}`,
    `cuisines: ${profile.cuisines.join(", ") || "any"}`,
    `favourite foods: ${profile.favoriteFoods.join(", ") || "-"}`,
    `spice level: ${profile.spiceLevel}/5`,
    `equipment: ${profile.equipment.join(", ") || "stove"}`,
    `skill: ${profile.skill}`,
    `time availability: ${profile.timeAvailability}`,
    `priorities (most important first): ${profile.priorities.join(" > ") || "nutrition"}`,
    `monthly budget: ₹${profile.budgetMonthly}`,
    `default servings: ${profile.servingsDefault}`,
    ...(limits ? [limits] : []),
  ].join("\n");
}

function pantryBlock(pantry: AiMealPlanRequest["pantry"]): string {
  if (pantry.length === 0) return "(pantry is empty)";
  return pantry
    .map(
      (p) =>
        `${p.ingredientId}\t${p.name}\t${p.quantity}${p.unit}\texpires ${p.expiresAt}`,
    )
    .join("\n");
}

function preferenceBlock(prefs: AiMealPlanRequest["preferences"]): string {
  if (!prefs || prefs.feedbackCount === 0) return "(no feedback history yet)";
  const top = (rec: Record<string, number>, n = 8) =>
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${k}:${v.toFixed(2)}`)
      .join(", ") || "-";
  return [
    `feedback count: ${prefs.feedbackCount}`,
    `liked recipes: ${top(prefs.recipeScores)}`,
    `cuisine affinity: ${top(prefs.cuisineAffinity)}`,
    `tag affinity: ${top(prefs.tagAffinity)}`,
    `ingredient affinity: ${top(prefs.ingredientAffinity, 12)}`,
    `spice adjust: ${prefs.spiceAdjust.toFixed(2)} (negative = wants milder)`,
    `portion adjust: ${prefs.portionAdjust.toFixed(2)} (multiplier on servings)`,
  ].join("\n");
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function mealPlanPrompt(req: AiMealPlanRequest): string {
  const dates = weekDates(req.weekStart);
  const locked = req.lockedMeals.filter((m) => m.locked);

  return [
    "Build a 7-day meal plan for one household.",
    "",
    "## Dates (Monday first) — use EXACTLY these seven values",
    dates.join(", "),
    "",
    "## Cook profile",
    profileBlock(req.profile),
    "",
    "## Pantry (ingredientId, name, quantity, expiry)",
    pantryBlock(req.pantry),
    "",
    "## Learned preferences",
    preferenceBlock(req.preferences),
    "",
    "## Locked meals — reproduce these entries unchanged",
    locked.length
      ? locked
          .map((m) => `${m.date}\t${m.mealType}\t${m.recipeId}\tservings ${m.servings}`)
          .join("\n")
      : "(none)",
    "",
    "## Notes from the cook",
    req.changes.length
      ? req.changes
          .map(
            (c) =>
              `${c.date}${c.mealType ? ` ${c.mealType}` : ""}: ${c.type}` +
              (c.availableMinutes ? ` (${c.availableMinutes} min available)` : "") +
              (c.guestCount ? ` (${c.guestCount} guests)` : "") +
              (c.moodTags.length ? ` (mood: ${c.moodTags.join(", ")})` : "") +
              (c.note ? ` — ${c.note}` : ""),
          )
          .join("\n")
      : "(none)",
    "",
    "## Recipes you may use",
    "Columns: id, name, mealTypes, tags, kcal/serving, protein g/serving, total minutes, ₹/serving, diets",
    recipeLines(req.recipes),
    "",
    "## Rules (hard)",
    "1. Return EXACTLY 21 meals: breakfast, lunch and dinner for each of the seven dates.",
    "2. `recipeId` MUST be copied from the recipe list above. Never invent one.",
    "3. `date` MUST be one of the seven dates above.",
    "4. Reproduce every locked meal exactly (same date, mealType, recipeId, servings).",
    "5. Respect the diet, allergies and restrictions absolutely — a violation is a failure.",
    "6. Only use recipes whose equipment the cook owns.",
    "",
    "## Rules (optimise, in priority order for this cook)",
    `a. Hit roughly ${req.profile.dailyCalorieTarget} kcal and ${req.profile.proteinTargetG} g protein per day across the three meals.`,
    "b. Use pantry stock that expires soonest first — waste reduction matters.",
    "c. Keep total weekly cost near budget/4.3 weeks.",
    "d. Variety: never repeat the same recipe within 3 days, and vary cuisines across the week.",
    "e. Keep weekday breakfasts short; longer recipes fit weekend lunches.",
    "f. Match the spice level and the cook's affinities.",
    "",
    `Set \`servings\` to ${req.profile.servingsDefault} unless a note says otherwise.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// adapt
// ---------------------------------------------------------------------------

const CHANGE_GUIDANCE: Record<string, string> = {
  less_time:
    "Swap the affected meals for recipes whose total minutes fit the available time. Prefer `quick` and `one_pot` tags.",
  guests:
    "Scale servings up for the guests and prefer `guest_friendly` recipes that stretch well.",
  eating_out:
    "Set the affected meal's status to `eating_out`, keep its recipeId unchanged, and rebalance the other meals that day so the daily calorie target still roughly holds.",
  mood_change:
    "Bias the affected meals toward the mood tags given (light, comfort, spicy, no_cooking).",
  skip_meal:
    "Set the affected meal's status to `skipped`, keep its recipeId unchanged, and shift its ingredients' use into nearby meals so nothing spoils.",
};

export function adaptPrompt(req: AiAdaptRequest): string {
  const { change, plan } = req;
  const today = change.date;
  const remaining = plan.meals.filter((m) => m.date >= today);
  const locked = remaining.filter((m) => m.locked);

  return [
    "The cook's situation changed. Re-optimise ONLY the meals that need to change.",
    "",
    "## The change",
    [
      `type: ${change.type}`,
      `date: ${change.date}`,
      change.mealType ? `meal: ${change.mealType}` : "meal: (whole day)",
      change.availableMinutes ? `available minutes: ${change.availableMinutes}` : "",
      change.guestCount ? `guests: ${change.guestCount}` : "",
      change.moodTags.length ? `mood: ${change.moodTags.join(", ")}` : "",
      change.note ? `note: ${change.note}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    "",
    "## How to handle this change type",
    CHANGE_GUIDANCE[change.type] ?? "Re-optimise sensibly.",
    "",
    "## Cook profile",
    profileBlock(req.profile),
    "",
    "## Pantry (ingredientId, name, quantity, expiry)",
    pantryBlock(req.pantry),
    "",
    "## Learned preferences",
    preferenceBlock(req.preferences),
    "",
    "## Remaining planned meals (id, date, mealType, recipeId, servings, locked, status)",
    remaining.length
      ? remaining
          .map(
            (m) =>
              `${m.id}\t${m.date}\t${m.mealType}\t${m.recipeId}\t${m.servings}\t${
                m.locked ? "LOCKED" : "free"
              }\t${m.status}`,
          )
          .join("\n")
      : "(none)",
    "",
    "## Recipes you may use",
    "Columns: id, name, mealTypes, tags, kcal/serving, protein g/serving, total minutes, ₹/serving, diets",
    recipeLines(req.recipes),
    "",
    "## Rules",
    "1. Return ONLY the meals you changed — do not echo meals that stay the same.",
    "2. `id` MUST be an existing planned-meal id from the list above.",
    `3. Never change a LOCKED meal${locked.length ? ` (${locked.length} of them)` : ""}.`,
    "4. Never change a meal whose date is before the change date.",
    "5. `recipeId` MUST come from the recipe list. Diet, allergies and restrictions are absolute.",
    "6. Keep each day's total calories close to the target after the change.",
    "7. `note` is one short user-facing reason, e.g. \"20-minute swap\" — or \"\".",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// cooking state
// ---------------------------------------------------------------------------

export function cookingStatePrompt(req: CookingStateRequest): string {
  return [
    "Look at the pan in the photo and judge whether it has reached the described state.",
    "",
    req.recipeName ? `Recipe: ${req.recipeName}` : "",
    req.stepTitle ? `Current step: ${req.stepTitle}` : "",
    `Target state: "${req.stateCue}"`,
    "",
    "Guidance:",
    "- `matches` is true only when the target state is clearly reached.",
    "- `confidence` reflects how clearly you can see the food (steam, glare, blur lower it).",
    "- `advice` is one short sentence the cook can act on right now, e.g.",
    "  \"Not yet — give it 2 more minutes and stir once\" or",
    "  \"Looks right, move to the next step now before it browns further\".",
    "- If the photo does not show cooking food at all, set matches false, confidence 0",
    "  and say you cannot see the pan.",
  ]
    .filter(Boolean)
    .join("\n");
}
