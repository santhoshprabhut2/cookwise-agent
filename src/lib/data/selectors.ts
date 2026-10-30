/**
 * Derived, **pure** helpers over store state.
 *
 * Nothing here reads a store directly — screens pass the slices they already
 * subscribe to, which keeps re-renders predictable and the logic unit-testable.
 * This module imports no store (and therefore no `"use client"` module), so it
 * is safe to import from anywhere.
 */

import type {
  CookSession,
  DailyIntake,
  ID,
  ISODate,
  MealPlan,
  MealType,
  PantryItem,
  Recipe,
  PlannedMeal,
  Unit,
  UserProfile,
} from "@/lib/types";
import { addDays, daysUntil, humanize, toISODate } from "@/lib/utils";
import { ingredientById } from "./seed/ingredients";

const EPS = 1e-6;

/** Canonical meal ordering used everywhere a day is rendered. */
export const MEAL_ORDER: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

function mealRank(m: MealType): number {
  const i = MEAL_ORDER.indexOf(m);
  return i < 0 ? MEAL_ORDER.length : i;
}

// ---------------------------------------------------------------------------
// Unit conversion (re-exported from `@/lib/data/stores`)
// ---------------------------------------------------------------------------

/** Used when a "pcs" ingredient has no `gramsPerPiece` in the catalog. */
export const DEFAULT_GRAMS_PER_PIECE = 100;

export function gramsPerPieceFor(ingredientId: ID): number {
  return ingredientById(ingredientId)?.gramsPerPiece ?? DEFAULT_GRAMS_PER_PIECE;
}

/** Quantity (in its own unit) → grams. `ml` is treated 1:1 with grams. */
export function toGrams(
  quantity: number,
  unit: Unit,
  ingredientId: ID,
): number {
  return unit === "pcs" ? quantity * gramsPerPieceFor(ingredientId) : quantity;
}

/** Grams → quantity in the row's own unit. */
export function fromGrams(grams: number, unit: Unit, ingredientId: ID): number {
  return unit === "pcs" ? grams / gramsPerPieceFor(ingredientId) : grams;
}

export function pantryItemGrams(item: PantryItem): number {
  return toGrams(item.quantity, item.unit, item.ingredientId);
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/** Meals planned for `date`, ordered breakfast → lunch → dinner → snack. */
export function todaysMeals(
  plan: MealPlan | undefined,
  date: ISODate = toISODate(),
): PlannedMeal[] {
  if (!plan) return [];
  return plan.meals
    .filter((m) => m.date === date)
    .sort((a, b) => mealRank(a.mealType) - mealRank(b.mealType));
}

/** Leftover meals that re-serve the dish cooked for `mealId`. */
export function leftoversOf(plan: MealPlan | undefined, mealId: ID): PlannedMeal[] {
  if (!plan) return [];
  return plan.meals.filter((m) => m.leftoverOf === mealId);
}

/**
 * How many servings to cook for `meal`: its own plus every leftover meal still
 * waiting to be eaten, because that dish is cooked once for all of them.
 */
export function cookServingsFor(plan: MealPlan | undefined, meal: PlannedMeal): number {
  const extra = leftoversOf(plan, meal.id)
    .filter((m) => m.status === "planned")
    .reduce((sum, m) => sum + m.servings, 0);
  return meal.servings + extra;
}

/** Last hour of the day a meal slot is still "next". */
const SLOT_END_HOUR: Record<MealType, number> = {
  breakfast: 11,
  lunch: 16,
  dinner: 23,
  snack: 23,
};

/**
 * The next uncooked meal for `date` (breakfast → lunch → dinner → snack).
 * `now` is used only to skip slots whose time already passed — if every
 * remaining slot has passed, the first still-`planned` meal is returned.
 */
export function nextMealToday(
  plan: MealPlan | undefined,
  date: ISODate = toISODate(),
  now: Date = new Date(),
): PlannedMeal | undefined {
  const planned = todaysMeals(plan, date).filter((m) => m.status === "planned");
  if (!planned.length) return undefined;
  if (date !== toISODate(now)) return planned[0];
  const hour = now.getHours();
  return planned.find((m) => hour <= SLOT_END_HOUR[m.mealType]) ?? planned[0];
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

function emptyIntake(date: ISODate): DailyIntake {
  return { date, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, mealsLogged: 0 };
}

function completedOn(session: CookSession, date: ISODate): boolean {
  if (session.status !== "completed" || !session.completedAt) return false;
  return toISODate(new Date(session.completedAt)) === date;
}

/**
 * Sum of what was actually cooked on `date`.
 *
 * Deliberately simple: recipe nutrition × servings. A session's `retention`
 * estimate is *not* applied — retention is surfaced on its own screen, and
 * discounting the daily totals by it would confuse the calorie goal.
 */
export function dailyIntake(
  sessions: CookSession[],
  recipes: Recipe[],
  date: ISODate = toISODate(),
): DailyIntake {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const total = emptyIntake(date);
  for (const s of sessions) {
    if (!completedOn(s, date)) continue;
    const r = byId.get(s.recipeId);
    if (!r) continue;
    const n = r.nutritionPerServing;
    total.kcal += (n.kcal ?? 0) * s.servings;
    total.proteinG += (n.proteinG ?? 0) * s.servings;
    total.carbsG += (n.carbsG ?? 0) * s.servings;
    total.fatG += (n.fatG ?? 0) * s.servings;
    total.mealsLogged += 1;
  }
  total.kcal = Math.round(total.kcal);
  total.proteinG = Math.round(total.proteinG);
  total.carbsG = Math.round(total.carbsG);
  total.fatG = Math.round(total.fatG);
  return total;
}

/** Same shape, but derived from plan meals marked `cooked` (no session needed). */
export function dailyIntakeFromPlan(
  plan: MealPlan | undefined,
  recipes: Recipe[],
  date: ISODate = toISODate(),
): DailyIntake {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const total = emptyIntake(date);
  for (const m of todaysMeals(plan, date)) {
    if (m.status !== "cooked") continue;
    const r = byId.get(m.recipeId);
    if (!r) continue;
    const n = r.nutritionPerServing;
    total.kcal += Math.round((n.kcal ?? 0) * m.servings);
    total.proteinG += Math.round((n.proteinG ?? 0) * m.servings);
    total.carbsG += Math.round((n.carbsG ?? 0) * m.servings);
    total.fatG += Math.round((n.fatG ?? 0) * m.servings);
    total.mealsLogged += 1;
  }
  return total;
}

export interface DayKcalProgress extends DailyIntake {
  target: number;
  /** 0..1, clamped. */
  pct: number;
}

export interface WeeklyKcalProgress {
  days: DayKcalProgress[];
  totalKcal: number;
  targetKcal: number;
  /** 0..1, clamped. */
  pct: number;
}

/** Seven days of intake starting at `weekStart` against the daily kcal target. */
export function weeklyKcalProgress(
  sessions: CookSession[],
  recipes: Recipe[],
  weekStart: ISODate,
  dailyTarget: number,
): WeeklyKcalProgress {
  const target = dailyTarget > 0 ? dailyTarget : 0;
  const days: DayKcalProgress[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const intake = dailyIntake(sessions, recipes, date);
    days.push({
      ...intake,
      target,
      pct: target ? Math.min(1, intake.kcal / target) : 0,
    });
  }
  const totalKcal = days.reduce((a, d) => a + d.kcal, 0);
  const targetKcal = target * 7;
  return {
    days,
    totalKcal,
    targetKcal,
    pct: targetKcal ? Math.min(1, totalKcal / targetKcal) : 0,
  };
}

// ---------------------------------------------------------------------------
// Pantry / expiring
// ---------------------------------------------------------------------------

export interface ExpiringSummary {
  items: PantryItem[];
  count: number;
  soonest?: PantryItem;
  /** "3 items expiring soon" / "1 item expiring soon" / "Nothing expiring soon". */
  label: string;
}

export function expiringSummary(
  pantry: PantryItem[],
  days = 3,
): ExpiringSummary {
  const items = pantry
    .filter((i) => daysUntil(i.expiresAt) <= days)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return {
    items,
    count: items.length,
    soonest: items[0],
    label: items.length
      ? `${items.length} item${items.length === 1 ? "" : "s"} expiring soon`
      : "Nothing expiring soon",
  };
}

export interface ExpiringRecipeMatch {
  recipe: Recipe;
  expiringUsed: PantryItem[];
}

/** Recipes that use the most expiring items; ties broken by shortest total time. */
export function recipesUsingExpiring(
  recipes: Recipe[],
  pantry: PantryItem[],
  days = 3,
): ExpiringRecipeMatch[] {
  const expiring = expiringSummary(pantry, days).items;
  if (!expiring.length) return [];
  return recipes
    .map((recipe) => ({
      recipe,
      expiringUsed: expiring.filter((p) =>
        recipe.ingredients.some((ri) => ri.ingredientId === p.ingredientId),
      ),
    }))
    .filter((m) => m.expiringUsed.length > 0)
    .sort(
      (a, b) =>
        b.expiringUsed.length - a.expiringUsed.length ||
        a.recipe.prepTimeMin +
          a.recipe.cookTimeMin -
          (b.recipe.prepTimeMin + b.recipe.cookTimeMin),
    );
}

export interface CoverageRow {
  ingredientId: ID;
  name: string;
  needGrams: number;
  haveGrams: number;
  ok: boolean;
  optional: boolean;
}

/** Per-ingredient "do I have enough?" for the recipe detail screen. */
export function pantryCoverage(
  recipe: Recipe,
  pantry: PantryItem[],
  servings: number = recipe.servings,
): CoverageRow[] {
  const factor = recipe.servings > 0 ? servings / recipe.servings : 1;
  return recipe.ingredients.map((ri) => {
    const needGrams = Math.round(ri.grams * factor);
    const haveGrams = Math.round(
      pantry
        .filter((p) => p.ingredientId === ri.ingredientId)
        .reduce((sum, p) => sum + pantryItemGrams(p), 0),
    );
    return {
      ingredientId: ri.ingredientId,
      name: ri.name,
      needGrams,
      haveGrams,
      ok: haveGrams + EPS >= needGrams,
      optional: ri.optional === true,
    };
  });
}

export interface ExpiringUsageStats {
  used: number;
  total: number;
  /** "Used 4 of 6 expiring items this month". */
  label: string;
}

/**
 * Best-effort "how many expiring items did I actually rescue?".
 *
 * LIMITATION: the app does not keep pantry history, so "was this expiring at the
 * time?" is approximated with the pantry as it looks **now**. Items that were
 * expiring and got fully consumed disappear from the pantry, so they are counted
 * neither in `used` nor in `total` — the ratio is therefore conservative.
 */
export function expiringUsageStats(
  sessions: CookSession[],
  pantry: PantryItem[] = [],
  opts: { days?: number; sinceDays?: number } = {},
): ExpiringUsageStats {
  const days = opts.days ?? 3;
  const sinceDays = opts.sinceDays ?? 30;
  const cutoff = Date.now() - sinceDays * 86_400_000;

  const expiringIds = new Set(
    pantry
      .filter((p) => daysUntil(p.expiresAt) <= days)
      .map((p) => p.ingredientId),
  );

  const loggedIds = new Set<ID>();
  for (const s of sessions) {
    if (s.status !== "completed" || !s.completedAt) continue;
    if (Date.parse(s.completedAt) < cutoff) continue;
    for (const l of s.ingredientLogs) loggedIds.add(l.ingredientId);
  }

  let used = 0;
  for (const id of expiringIds) if (loggedIds.has(id)) used += 1;

  const total = expiringIds.size;
  return {
    used,
    total,
    label: `Used ${used} of ${total} expiring item${total === 1 ? "" : "s"} this month`,
  };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

const PRIORITY_PHRASE: Record<string, string> = {
  nutrition: "improve energy",
  time: "save time",
  budget: "save money",
  taste: "eat tastier",
  waste_reduction: "reduce waste",
};

/** "Muscle gain + improve energy" — goal plus the user's top priority. */
export function goalLabel(profile: UserProfile | null | undefined): string {
  if (!profile) return "Balanced eating";
  const goal = humanize(profile.goal);
  const phrase = PRIORITY_PHRASE[profile.priorities[0] ?? ""];
  return phrase ? `${goal} + ${phrase}` : goal;
}

/** "20 years • Chennai, India" — profile header subtitle. */
export function profileSubtitle(
  profile: UserProfile | null | undefined,
): string {
  if (!profile) return "";
  return [profile.age ? `${profile.age} years` : null, profile.city]
    .filter(Boolean)
    .join(" • ");
}
