/**
 * Heuristic weekly meal planner.
 *
 * `generateWeekPlan` fills 7 days × (breakfast, lunch, dinner) greedily:
 * hard filters remove impossible recipes, a weighted 0–100 soft score ranks the
 * rest, and a seeded PRNG breaks ties so the same input always yields the same
 * plan (while "Regenerate" with a new `seed` yields a different one).
 *
 * `adaptPlan` re-optimises the remaining meals after a `ScheduleChange`.
 */

import type {
  ID,
  Ingredient,
  ISODate,
  MealPlan,
  MealPlanRequest,
  MealType,
  PantryItem,
  PlannedMeal,
  PlannedMealStatus,
  PreferenceModel,
  Priority,
  Recipe,
  RecipeTag,
  ScheduleChange,
  TimeAvailability,
  UserProfile,
} from "@/lib/types";
import { addDays, clamp, humanize, nowIso, uid } from "@/lib/utils";
import {
  BATCH_BASE_POINTS,
  BATCH_MEAL_TYPES,
  BATCH_MIN_TOTAL_MIN,
  BATCH_RELIEF_POINTS,
  BUDGET_CEILING,
  DAYS_PER_WEEK,
  DEFAULT_PRIORITY_ORDER,
  EATING_OUT_KCAL_FACTOR,
  ENERGY_INGREDIENT_HINTS,
  FASTEST_FALLBACK_COUNT,
  FRESHNESS_POINTS,
  INCOMPLETE_MEAL_PENALTY,
  LAST_WEEKDAY_INDEX,
  LIGHT_MOODS,
  MIN_WHOLE_PLATE_CHOICES,
  MEAL_KCAL_SPLIT,
  MOOD_SPECS,
  PLAN_MEAL_TYPES,
  PRIORITY_WEIGHTS,
  REHEAT_MIN,
  SCHEDULED_MEAL_TYPES,
  SCORE_JITTER,
  SIMPLE_MAX_INGREDIENTS,
  SIMPLE_MAX_STEPS,
  SIMPLICITY_WEIGHT,
  SLOT_TIME_MIN,
  TAG_PHRASES,
  TIME_LIMIT_MIN,
  VARIETY_SAME_CUISINE_PENALTY,
  VARIETY_SAME_METHOD_PENALTY,
  VARIETY_SAME_RECIPE_PENALTY,
  VARIETY_WEEK_REPEAT_PENALTY,
  VARIETY_WINDOW_DAYS,
  WASTE_SATURATION_G,
  WASTE_WINDOW_DAYS,
  WEEKDAY_KEYS,
  WEEKS_PER_MONTH,
  type MoodSpec,
} from "./constants";
import { freshnessFit } from "./freshness";
import { sanitizeLeftovers } from "./leftovers";
import { isCompleteMeal, isPlannable } from "./meals";
import {
  daysBetween,
  hashSeed,
  matchesToken,
  mean,
  mulberry32,
  normalizeText,
  roundToHalf,
} from "./helpers";
import { gramsOf, indexIngredients } from "./nutrition";

export { sanitizeLeftovers };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlannerContext {
  profile: UserProfile;
  recipes: Recipe[];
  pantry: PantryItem[];
  preferences?: PreferenceModel;
  /** Catalog, so re-planning can order perishable ingredients. Optional. */
  ingredients?: Ingredient[];
  /** Reference date for "this week's shop"; defaults to the plan's week start. */
  today?: ISODate;
}

/** One (day, mealType) cell of the week grid. */
export interface MealSlot {
  date: ISODate;
  mealType: MealType;
  /** 0 = Monday … 6 = Sunday. */
  dayIndex: number;
}

/** Aggregated pantry stock that is about to go off. */
export interface ExpiringStock {
  ingredientId: ID;
  grams: number;
  /** Earliest expiry among the lots counted here. */
  expiresAt: ISODate;
}

/** Everything `scoreRecipe` needs. Every field but `profile` is optional. */
export interface ScoreContext {
  profile: UserProfile;
  preferences?: PreferenceModel;
  /** Soon-to-expire pantry grams keyed by ingredient id. */
  expiring?: Map<ID, ExpiringStock>;
  /** Meals already committed, for the variety penalty. */
  chosen?: PlannedMeal[];
  recipeById?: Map<ID, Recipe>;
  /** `budgetMonthly / 4.3`. */
  weeklyBudget?: number;
  spentSoFar?: number;
  /** Slots still to fill, including this one. */
  remainingMeals?: number;
  servings?: number;
  /** Extra per-tag bias in −1..1; used by `adaptPlan` for mood changes. */
  tagBias?: Partial<Record<RecipeTag, number>>;
  /** Seeded PRNG. When absent, scoring is fully deterministic (no jitter). */
  rng?: () => number;
  /** Catalog by id. With `shopDate` it enables the early-spoilers-first ordering. */
  ingredientById?: Map<ID, Ingredient>;
  /** The day the week's groceries are bought; freshness is counted from here. */
  shopDate?: ISODate;
  /**
   * Meal type of the next lunch/dinner when it is free to hold a leftover, so a
   * batch-friendly dish cooked now can be reheated there.
   */
  batchTarget?: MealType;
  /** True when that next meal is rushed, which makes a leftover worth more. */
  batchRushed?: boolean;
  /** Do not mark down a lunch or dinner for lacking rice or chapati (a "light" mood). */
  waiveCompleteMeal?: boolean;
}

export interface RecipeScore {
  /** 0..100. */
  total: number;
  parts: Record<string, number>;
}

export interface GenerateOptions {
  /** Change this to get a different (still deterministic) plan. */
  seed?: number | string;
  /** Catalog, used to convert `pcs` pantry quantities to grams. */
  ingredients?: Ingredient[];
  /** Reference date for "expiring soon"; defaults to `req.weekStart`. */
  today?: ISODate;
}

export interface MealDiff {
  mealId: ID;
  date: ISODate;
  mealType: MealType;
  fromRecipeId?: ID;
  toRecipeId?: ID;
  fromServings?: number;
  toServings?: number;
  statusChange?: { from: PlannedMealStatus; to: PlannedMealStatus };
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

const MEAL_ORDER: Record<MealType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

function slotKey(date: ISODate, mealType: MealType): string {
  return `${date}|${mealType}`;
}

function compareMeals(a: PlannedMeal, b: PlannedMeal): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return MEAL_ORDER[a.mealType] - MEAL_ORDER[b.mealType];
}

/** Servings for every generated meal, honouring the learned portion adjust. */
export function servingsFor(
  profile: UserProfile,
  preferences?: PreferenceModel,
): number {
  const raw = (profile.servingsDefault || 2) * (preferences?.portionAdjust ?? 1);
  return Math.max(1, roundToHalf(raw));
}

/** `profile.priorities` order → a weight per priority (unranked ones back-filled). */
export function priorityWeights(profile: UserProfile): Record<Priority, number> {
  const order: Priority[] = [];
  for (const p of profile.priorities ?? []) if (!order.includes(p)) order.push(p);
  for (const p of DEFAULT_PRIORITY_ORDER) if (!order.includes(p)) order.push(p);
  const out = {} as Record<Priority, number>;
  order.forEach((p, i) => {
    out[p] = PRIORITY_WEIGHTS[i] ?? 0.05;
  });
  return out;
}

/** Minutes of prep+cook tolerated for a slot. */
export function timeLimitFor(ta: TimeAvailability, dayIndex: number): number {
  if (ta === "varies") {
    return dayIndex <= LAST_WEEKDAY_INDEX
      ? TIME_LIMIT_MIN.varies
      : Number.POSITIVE_INFINITY;
  }
  return TIME_LIMIT_MIN[ta] ?? TIME_LIMIT_MIN.medium;
}

/** Prep plus cook minutes for a recipe. */
export function totalMinutes(recipe: Recipe): number {
  return (recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0);
}

/** The schedule cell for a slot, when the user has set one. */
function scheduledTime(profile: UserProfile, slot: MealSlot) {
  const day = WEEKDAY_KEYS[slot.dayIndex];
  const meal = SCHEDULED_MEAL_TYPES.find((m) => m === slot.mealType);
  if (!day || !meal) return undefined;
  return profile.timeSchedule?.[day]?.[meal];
}

/**
 * Minutes of prep+cook a specific slot allows. The user's weekly schedule wins
 * when it covers the slot; otherwise the single `timeAvailability` setting.
 */
export function slotTimeLimit(profile: UserProfile, slot: MealSlot): number {
  const level = scheduledTime(profile, slot);
  if (level) return SLOT_TIME_MIN[level] ?? Number.POSITIVE_INFINITY;
  return timeLimitFor(profile.timeAvailability, slot.dayIndex);
}

/** 0..100: how easy a recipe is for a beginner (few ingredients, few steps, easy). */
export function simplicityFit(recipe: Recipe): number {
  const difficulty =
    recipe.difficulty === "easy" ? 100 : recipe.difficulty === "medium" ? 55 : 20;
  const extraIngredients = Math.max(
    0,
    (recipe.ingredients?.length ?? 0) - SIMPLE_MAX_INGREDIENTS,
  );
  const extraSteps = Math.max(0, (recipe.steps?.length ?? 0) - SIMPLE_MAX_STEPS);
  const ingredients = clamp(100 - 7 * extraIngredients, 30, 100);
  const steps = clamp(100 - 12 * extraSteps, 30, 100);
  return 0.55 * difficulty + 0.3 * ingredients + 0.15 * steps;
}

/** A long dish that keeps well and can be cooked once for two meals. */
export function isBatchable(recipe: Recipe): boolean {
  return (
    (recipe.tags ?? []).includes("batch_friendly") &&
    totalMinutes(recipe) >= BATCH_MIN_TOTAL_MIN
  );
}

/**
 * Aggregate pantry stock that expires within `withinDays` of `from`.
 * Grams are summed per ingredient; `expiresAt` is the earliest lot.
 */
export function expiringStock(
  pantry: readonly PantryItem[],
  from: ISODate,
  withinDays: number = WASTE_WINDOW_DAYS,
  ingredients?: readonly Ingredient[],
): Map<ID, ExpiringStock> {
  const catalog = indexIngredients(ingredients);
  const out = new Map<ID, ExpiringStock>();
  for (const item of pantry ?? []) {
    const left = daysBetween(from, item.expiresAt);
    if (left > withinDays) continue;
    const grams = gramsOf(item.quantity, item.unit, catalog.get(item.ingredientId));
    if (grams <= 0) continue;
    const prev = out.get(item.ingredientId);
    if (prev) {
      prev.grams += grams;
      if (item.expiresAt < prev.expiresAt) prev.expiresAt = item.expiresAt;
    } else {
      out.set(item.ingredientId, {
        ingredientId: item.ingredientId,
        grams,
        expiresAt: item.expiresAt,
      });
    }
  }
  return out;
}

function recipeHasEnergyIngredient(recipe: Recipe): boolean {
  for (const ri of recipe.ingredients ?? []) {
    const hay = `${ri.ingredientId} ${ri.name}`;
    if (ENERGY_INGREDIENT_HINTS.some((t) => matchesToken(hay, t))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Soft-score components (each 0..100)
// ---------------------------------------------------------------------------

/** Target kcal for one serving in a slot. */
export function kcalTargetFor(profile: UserProfile, mealType: MealType): number {
  const split = MEAL_KCAL_SPLIT[mealType] ?? 1 / 3;
  return Math.max(1, (profile.dailyCalorieTarget || 2000) * split);
}

function nutritionFit(recipe: Recipe, slot: MealSlot, profile: UserProfile): number {
  const kcalTarget = kcalTargetFor(profile, slot.mealType);
  const proteinTarget = Math.max(
    1,
    (profile.proteinTargetG || 60) * (MEAL_KCAL_SPLIT[slot.mealType] ?? 1 / 3),
  );
  const kcal = recipe.nutritionPerServing?.kcal ?? 0;
  const protein = recipe.nutritionPerServing?.proteinG ?? 0;

  // Gaussian around the target: ±35 % is still a decent fit.
  const kcalScore =
    100 * Math.exp(-0.5 * ((kcal - kcalTarget) / (0.35 * kcalTarget)) ** 2);
  const proteinScore = 100 * clamp(protein / proteinTarget, 0, 1);

  const tags = new Set(recipe.tags ?? []);
  let bonus = 0;
  switch (profile.goal) {
    case "muscle_gain":
      if (tags.has("high_protein")) bonus += 15;
      break;
    case "weight_loss":
      if (tags.has("low_cal")) bonus += 10;
      if (tags.has("high_fiber")) bonus += 5;
      break;
    case "improve_energy":
      if (recipeHasEnergyIngredient(recipe)) bonus += 10;
      if (tags.has("high_fiber")) bonus += 4;
      break;
    default:
      if (tags.has("high_fiber")) bonus += 5;
      if (tags.has("high_protein")) bonus += 5;
      break;
  }
  return clamp(0.55 * kcalScore + 0.45 * proteinScore + bonus, 0, 100);
}

function timeFit(recipe: Recipe, slot: MealSlot, profile: UserProfile): number {
  const total = totalMinutes(recipe);
  const limit = slotTimeLimit(profile, slot);
  let fit: number;
  if (!Number.isFinite(limit)) fit = clamp(100 - total * 0.4, 40, 100);
  else if (total <= limit) fit = clamp(100 - 40 * (total / limit), 60, 100);
  else fit = clamp(60 - (total - limit) * 2.5, 0, 60);

  // "Make the dishes simple": beginners are pulled towards easy recipes.
  const simple = SIMPLICITY_WEIGHT[profile.skill] ?? 0;
  return simple > 0 ? (1 - simple) * fit + simple * simplicityFit(recipe) : fit;
}

function budgetFit(recipe: Recipe, ctx: ScoreContext, servings: number): number {
  const weekly = ctx.weeklyBudget ?? 0;
  if (!weekly || !Number.isFinite(weekly)) return 70;
  const spent = ctx.spentSoFar ?? 0;
  const remaining = Math.max(1, ctx.remainingMeals ?? 1);
  const allowance = Math.max(1, (weekly - spent) / remaining);
  const cost = (recipe.costPerServing ?? 0) * servings;
  if (spent + cost > weekly) return 0;
  if (cost <= allowance) return clamp(100 - 25 * (cost / allowance), 75, 100);
  return clamp(75 - 75 * ((cost - allowance) / allowance), 0, 75);
}

interface WasteFit {
  score: number;
  items: number;
  grams: number;
}

function wasteFit(
  recipe: Recipe,
  slot: MealSlot,
  ctx: ScoreContext,
  servings: number,
): WasteFit {
  const expiring = ctx.expiring;
  if (!expiring || expiring.size === 0) return { score: 0, items: 0, grams: 0 };
  const scale = servings / Math.max(1, recipe.servings || 1);
  let covered = 0;
  let items = 0;
  let urgency = 0;
  for (const ri of recipe.ingredients ?? []) {
    const stock = expiring.get(ri.ingredientId);
    if (!stock || stock.grams <= 0) continue;
    // Only a bonus when the meal is cooked on or before the expiry date.
    if (slot.date > stock.expiresAt) continue;
    const g = Math.min(ri.grams * scale, stock.grams);
    if (g <= 0) continue;
    covered += g;
    items += 1;
    const daysLeft = Math.max(0, daysBetween(slot.date, stock.expiresAt));
    urgency = Math.max(urgency, 1 / (1 + daysLeft));
  }
  if (covered <= 0) return { score: 0, items: 0, grams: 0 };
  const base = 100 * clamp(covered / WASTE_SATURATION_G, 0, 1);
  return {
    score: clamp(base * (0.75 + 0.35 * urgency), 0, 100),
    items,
    grams: covered,
  };
}

/** Spice level the plan should aim for, given the learned adjustment. */
export function spiceTarget(profile: UserProfile, preferences?: PreferenceModel): number {
  return clamp((profile.spiceLevel || 3) + 2 * (preferences?.spiceAdjust ?? 0), 1, 5);
}

function favouriteMatch(recipe: Recipe, favourites: readonly string[] | undefined): boolean {
  const name = normalizeText(recipe.name);
  for (const fav of favourites ?? []) {
    const f = normalizeText(fav);
    if (!f) continue;
    if (name.includes(f) || f.includes(name)) return true;
  }
  return false;
}

function tasteFit(recipe: Recipe, ctx: ScoreContext): number {
  const { profile, preferences } = ctx;
  let t = 40;

  if ((profile.cuisines ?? []).includes(recipe.cuisine)) t += 18;

  const diff = Math.abs((recipe.spiceLevel ?? 3) - spiceTarget(profile, preferences));
  t += 18 * Math.max(0, 1 - diff / 2.5);

  if (favouriteMatch(recipe, profile.favoriteFoods)) t += 12;

  if (preferences) {
    t += 20 * clamp(preferences.recipeScores?.[recipe.id] ?? 0, -1, 1);
    t += 8 * clamp(preferences.cuisineAffinity?.[recipe.cuisine] ?? 0, -1, 1);
    const tagAff = mean(
      (recipe.tags ?? []).map((tag) => clamp(preferences.tagAffinity?.[tag] ?? 0, -1, 1)),
    );
    t += 8 * tagAff;
    const ingAff = mean(
      (recipe.ingredients ?? []).map((ri) =>
        clamp(preferences.ingredientAffinity?.[ri.ingredientId] ?? 0, -1, 1),
      ),
    );
    t += 8 * ingAff;
  }

  if (ctx.tagBias) {
    let bias = 0;
    for (const tag of recipe.tags ?? []) bias += ctx.tagBias[tag] ?? 0;
    t += 25 * clamp(bias, -1, 1);
  }

  return clamp(t, 0, 100);
}

function varietyPenalty(recipe: Recipe, slot: MealSlot, ctx: ScoreContext): number {
  const chosen = ctx.chosen ?? [];
  const byId = ctx.recipeById;
  let penalty = 0;
  let sameMethodToday = 0;
  let sameCuisineToday = 0;

  for (const m of chosen) {
    if (m.recipeId === recipe.id) {
      const gap = Math.abs(daysBetween(m.date, slot.date));
      if (gap <= VARIETY_WINDOW_DAYS) {
        penalty += Math.max(
          0,
          VARIETY_SAME_RECIPE_PENALTY - 10 * gap,
        );
      } else if (!m.leftoverOf) {
        penalty += VARIETY_WEEK_REPEAT_PENALTY;
      }
    }
    if (m.date === slot.date && byId) {
      const other = byId.get(m.recipeId);
      if (!other) continue;
      if (other.primaryMethod === recipe.primaryMethod) sameMethodToday += 1;
      if (other.cuisine === recipe.cuisine) sameCuisineToday += 1;
    }
  }
  penalty += VARIETY_SAME_METHOD_PENALTY * sameMethodToday;
  penalty += VARIETY_SAME_CUISINE_PENALTY * sameCuisineToday;
  return penalty;
}

interface FreshPoints {
  /** Signed points added to the total: positive when the day suits the ingredients. */
  points: number;
  items: number;
  /** 0..100, 50 neutral. */
  score: number;
}

/** Early spoilers first: reward cooking short-lived ingredients while they are fresh. */
function freshnessPoints(recipe: Recipe, slot: MealSlot, ctx: ScoreContext): FreshPoints {
  if (!ctx.ingredientById || !ctx.shopDate) return { points: 0, items: 0, score: 50 };
  const fit = freshnessFit(
    recipe,
    daysBetween(ctx.shopDate, slot.date),
    ctx.ingredientById,
  );
  if (fit.items === 0) return { points: 0, items: 0, score: 50 };
  return {
    points: FRESHNESS_POINTS * ((fit.score - 50) / 50),
    items: fit.items,
    score: fit.score,
  };
}

/** Bonus for a batch dish whose leftovers can feed the next lunch or dinner. */
function batchReliefPoints(recipe: Recipe, ctx: ScoreContext): number {
  if (!ctx.batchTarget || !isBatchable(recipe)) return 0;
  if (!(recipe.mealTypes ?? []).includes(ctx.batchTarget)) return 0;
  return BATCH_BASE_POINTS + (ctx.batchRushed ? BATCH_RELIEF_POINTS : 0);
}

// ---------------------------------------------------------------------------
// Scoring & explanation
// ---------------------------------------------------------------------------

/**
 * Weighted 0–100 fit of `recipe` for `slot`.
 * `parts` carries every component so the UI can explain a choice.
 */
export function scoreRecipe(
  recipe: Recipe,
  slot: MealSlot,
  ctx: ScoreContext,
): RecipeScore {
  const servings = ctx.servings ?? ctx.profile.servingsDefault ?? 2;
  const w = priorityWeights(ctx.profile);

  const nutrition = nutritionFit(recipe, slot, ctx.profile);
  const time = timeFit(recipe, slot, ctx.profile);
  const budget = budgetFit(recipe, ctx, servings);
  const waste = wasteFit(recipe, slot, ctx, servings);
  const taste = tasteFit(recipe, ctx);
  const variety = varietyPenalty(recipe, slot, ctx);
  const jitter = ctx.rng ? ctx.rng() * SCORE_JITTER : 0;
  const fresh = freshnessPoints(recipe, slot, ctx);
  const relief = batchReliefPoints(recipe, ctx);
  // A lunch or dinner that is only a curry or a side is not a meal yet.
  const incomplete =
    !ctx.waiveCompleteMeal &&
    (slot.mealType === "lunch" || slot.mealType === "dinner") &&
    !isCompleteMeal(recipe)
      ? INCOMPLETE_MEAL_PENALTY
      : 0;

  const weighted =
    w.nutrition * nutrition +
    w.time * time +
    w.budget * budget +
    w.waste_reduction * waste.score +
    w.taste * taste;

  return {
    total: clamp(weighted - variety - incomplete + jitter + fresh.points + relief, 0, 100),
    parts: {
      nutrition,
      time,
      budget,
      waste: waste.score,
      taste,
      variety: -variety,
      incomplete: incomplete === 0 ? 0 : -incomplete,
      freshness: fresh.points,
      freshItems: fresh.items,
      batch: relief,
      expiringItems: waste.items,
      expiringGrams: Math.round(waste.grams),
    },
  };
}

/** One-line reason, e.g. "Uses 2 items expiring soon · high protein · 20 min". */
export function explainMeal(
  recipe: Recipe,
  slot: MealSlot,
  ctx: ScoreContext,
): string {
  const servings = ctx.servings ?? ctx.profile.servingsDefault ?? 2;
  const parts: string[] = [];

  const waste = wasteFit(recipe, slot, ctx, servings);
  if (waste.items > 0) {
    parts.push(
      `Uses ${waste.items} item${waste.items === 1 ? "" : "s"} expiring soon`,
    );
  }

  const fresh = freshnessPoints(recipe, slot, ctx);
  if (fresh.items > 0 && fresh.score >= 85) parts.push("uses fresh produce early");

  for (const tag of recipe.tags ?? []) {
    const phrase = TAG_PHRASES[tag];
    if (phrase) {
      parts.push(phrase);
      break;
    }
  }

  if (parts.length < 2 && (ctx.profile.cuisines ?? []).includes(recipe.cuisine)) {
    parts.push(`${humanize(recipe.cuisine)} favourite`);
  }

  parts.push(`${(recipe.prepTimeMin ?? 0) + (recipe.cookTimeMin ?? 0)} min`);
  return parts.slice(0, 3).join(" · ");
}

// ---------------------------------------------------------------------------
// Week generation
// ---------------------------------------------------------------------------

function weekSlots(weekStart: ISODate): MealSlot[] {
  const slots: MealSlot[] = [];
  for (let d = 0; d < DAYS_PER_WEEK; d += 1) {
    const date = addDays(weekStart, d);
    for (const mealType of PLAN_MEAL_TYPES) {
      slots.push({ date, mealType, dayIndex: d });
    }
  }
  return slots;
}

function candidatesFor(allowed: readonly Recipe[], mealType: MealType): Recipe[] {
  const matching = allowed.filter((r) => (r.mealTypes ?? []).includes(mealType));
  // Relax the slot requirement rather than leaving a hole in the week.
  return matching.length > 0 ? matching : [...allowed];
}

function bestOf(
  candidates: readonly Recipe[],
  slot: MealSlot,
  ctx: ScoreContext,
): Recipe | undefined {
  let best: Recipe | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const r of candidates) {
    const s = scoreRecipe(r, slot, ctx).total;
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return best;
}

/** Deduct the grams a chosen recipe will use so later days do not re-claim them. */
function consumeExpiring(
  expiring: Map<ID, ExpiringStock>,
  recipe: Recipe,
  servings: number,
): void {
  const scale = servings / Math.max(1, recipe.servings || 1);
  for (const ri of recipe.ingredients ?? []) {
    const stock = expiring.get(ri.ingredientId);
    if (!stock) continue;
    stock.grams = Math.max(0, stock.grams - ri.grams * scale);
    if (stock.grams <= 0) expiring.delete(ri.ingredientId);
  }
}

/**
 * Candidates for one slot. When the weekly schedule caps this slot's time, only
 * recipes that fit are offered, so "Thursday morning: very little time" is a
 * rule rather than a preference. If nothing of the right meal type fits, any
 * allowed recipe that does is used; failing that, the fastest few.
 */
function candidatesForSlot(
  allowed: readonly Recipe[],
  slot: MealSlot,
  profile: UserProfile,
): Recipe[] {
  const base = candidatesFor(allowed, slot.mealType);
  if (!scheduledTime(profile, slot)) return base;
  const limit = slotTimeLimit(profile, slot);
  if (!Number.isFinite(limit)) return base;

  const fits = (r: Recipe) => totalMinutes(r) <= limit;
  const ofType = base.filter(fits);
  if (ofType.length > 0) return ofType;
  const anyType = allowed.filter(fits);
  if (anyType.length > 0) return anyType;
  return [...base]
    .sort((a, b) => totalMinutes(a) - totalMinutes(b))
    .slice(0, FASTEST_FALLBACK_COUNT);
}

/**
 * Keep only the dishes the budget can still afford. `room` is what the week may
 * still spend on this meal after setting aside the cheapest possible meals for
 * the slots that follow. When nothing is affordable the cheapest few are kept,
 * so the week still fills and overspends as little as it can.
 */
function affordableOnly(
  pool: readonly Recipe[],
  room: number,
  costOf: (r: Recipe) => number,
): Recipe[] {
  if (!Number.isFinite(room)) return [...pool];
  const fits = pool.filter((r) => costOf(r) <= room);
  if (fits.length > 0) return fits;
  return [...pool].sort((a, b) => costOf(a) - costOf(b)).slice(0, FASTEST_FALLBACK_COUNT);
}

/** The next lunch or dinner after `slot`, if it is no more than a day later. */
function nextMainSlot(grid: readonly MealSlot[], slot: MealSlot): MealSlot | undefined {
  const at = grid.findIndex((s) => s.date === slot.date && s.mealType === slot.mealType);
  if (at < 0) return undefined;
  for (let j = at + 1; j < grid.length; j += 1) {
    const next = grid[j];
    if (daysBetween(slot.date, next.date) > 1) return undefined;
    if (BATCH_MEAL_TYPES.includes(next.mealType)) return next;
  }
  return undefined;
}

export function generateWeekPlan(
  req: MealPlanRequest,
  recipes: Recipe[],
  opts: GenerateOptions = {},
): MealPlan {
  const ts = nowIso();
  const planId = uid();
  const { profile, weekStart } = req;

  const recipeById = new Map<ID, Recipe>(recipes.map((r) => [r.id, r]));
  const allowed = recipes.filter((r) => isPlannable(r, profile));
  const rng = mulberry32(hashSeed(weekStart, profile.id, opts.seed ?? ""));
  const servings = servingsFor(profile, req.preferences);
  const weeklyBudget = (profile.budgetMonthly || 0) / WEEKS_PER_MONTH;
  const expiring = expiringStock(
    req.pantry ?? [],
    opts.today ?? weekStart,
    WASTE_WINDOW_DAYS,
    opts.ingredients,
  );

  const weekEnd = addDays(weekStart, DAYS_PER_WEEK - 1);

  // Early spoilers first: freshness is counted from the day the groceries are
  // bought, which is the start of the week or today when planning mid-week.
  const ingredientById = opts.ingredients?.length
    ? indexIngredients(opts.ingredients)
    : undefined;
  const shopDate =
    opts.today && opts.today > weekStart && opts.today <= weekEnd
      ? opts.today
      : weekStart;

  const locked: PlannedMeal[] = (req.lockedMeals ?? [])
    .filter((m) => m.date >= weekStart && m.date <= weekEnd)
    .map((m) => ({ ...m, planId, locked: true }));
  const lockedKeys = new Set(locked.map((m) => slotKey(m.date, m.mealType)));

  const chosen: PlannedMeal[] = [...locked];
  let spent = 0;
  for (const m of locked) {
    const r = recipeById.get(m.recipeId);
    if (r) spent += (r.costPerServing ?? 0) * m.servings;
  }

  const grid = weekSlots(weekStart);
  const open = grid.filter((s) => !lockedKeys.has(slotKey(s.date, s.mealType)));
  /** Slots already holding a leftover decided at an earlier slot. */
  const prefilled = new Set<string>();
  let remaining = open.length;

  // The cheapest a meal of each type can be (a whole plate for lunch and dinner),
  // used to keep enough budget aside for the meals still to come.
  const cheapestMeal = (mealType: MealType): number => {
    const pool = candidatesFor(allowed, mealType);
    const whole = pool.filter(isCompleteMeal);
    const basis =
      mealType !== "breakfast" && whole.length >= MIN_WHOLE_PLATE_CHOICES ? whole : pool;
    const costs = basis.map((r) => (r.costPerServing ?? 0) * servings);
    return costs.length > 0 ? Math.min(...costs) : 0;
  };
  const floors: Record<string, number> = {
    breakfast: cheapestMeal("breakfast"),
    lunch: cheapestMeal("lunch"),
    dinner: cheapestMeal("dinner"),
  };

  for (const [at, slot] of open.entries()) {
    if (prefilled.has(slotKey(slot.date, slot.mealType))) continue;

    // Could this slot's dish also feed the next lunch or dinner?
    const target = BATCH_MEAL_TYPES.includes(slot.mealType)
      ? nextMainSlot(grid, slot)
      : undefined;
    let targetFree =
      target !== undefined && !lockedKeys.has(slotKey(target.date, target.mealType))
        ? target
        : undefined;

    // Save a relaxed meal for a rushed one: when the next meal could itself
    // cook a dish for an even more rushed meal after it, do not spend it here.
    if (targetFree && slotTimeLimit(profile, targetFree) >= BATCH_MIN_TOTAL_MIN) {
      const after = nextMainSlot(grid, targetFree);
      if (
        after &&
        !lockedKeys.has(slotKey(after.date, after.mealType)) &&
        slotTimeLimit(profile, after) < BATCH_MIN_TOTAL_MIN
      ) {
        targetFree = undefined;
      }
    }

    const ctx: ScoreContext = {
      profile,
      preferences: req.preferences,
      expiring,
      chosen,
      recipeById,
      weeklyBudget,
      spentSoFar: spent,
      remainingMeals: remaining,
      servings,
      rng,
      ingredientById,
      shopDate,
      batchTarget: targetFree?.mealType,
      batchRushed: targetFree
        ? slotTimeLimit(profile, targetFree) < BATCH_MIN_TOTAL_MIN
        : undefined,
    };
    // Budget as a ceiling: set aside the cheapest possible meals for the slots
    // still to come, and offer only the dishes that fit in what is left. A batch
    // dish also pays for the leftover it will feed.
    let pool = candidatesForSlot(allowed, slot, profile);
    // Lunch and dinner are whole plates whenever any whole plate is allowed.
    if (slot.mealType !== "breakfast") {
      const whole = pool.filter(isCompleteMeal);
      if (whole.length >= MIN_WHOLE_PLATE_CHOICES) pool = whole;
    }
    if (weeklyBudget > 0) {
      let reserve = 0;
      for (const later of open.slice(at + 1)) {
        if (!prefilled.has(slotKey(later.date, later.mealType))) {
          reserve += floors[later.mealType] ?? 0;
        }
      }
      const room = weeklyBudget * BUDGET_CEILING - spent - reserve;
      const leftoverType = targetFree?.mealType;
      pool = affordableOnly(pool, room + 0.0001, (r) => {
        const single = (r.costPerServing ?? 0) * servings;
        const feedsLeftover =
          leftoverType !== undefined &&
          isBatchable(r) &&
          (r.mealTypes ?? []).includes(leftoverType);
        // The leftover meal is paid for now, so its slot needs no reserve.
        return feedsLeftover ? 2 * single - (floors[leftoverType] ?? 0) : single;
      });
    }
    const best = bestOf(pool, slot, ctx);
    remaining -= 1;
    if (!best) continue;

    const mealId = uid();
    chosen.push({
      id: mealId,
      planId,
      date: slot.date,
      mealType: slot.mealType,
      recipeId: best.id,
      servings,
      locked: false,
      status: "planned",
    });
    spent += (best.costPerServing ?? 0) * servings;
    consumeExpiring(expiring, best, servings);

    // Cook once, eat twice: a long, reheat-friendly dish also feeds the next
    // lunch or dinner, so that meal needs reheating rather than cooking.
    if (
      targetFree &&
      isBatchable(best) &&
      (best.mealTypes ?? []).includes(targetFree.mealType)
    ) {
      chosen.push({
        id: uid(),
        planId,
        date: targetFree.date,
        mealType: targetFree.mealType,
        recipeId: best.id,
        servings,
        locked: false,
        status: "planned",
        leftoverOf: mealId,
      });
      prefilled.add(slotKey(targetFree.date, targetFree.mealType));
      remaining -= 1;
      spent += (best.costPerServing ?? 0) * servings;
      consumeExpiring(expiring, best, servings);
    }
  }

  return {
    id: planId,
    userId: profile.id,
    weekStart,
    meals: sanitizeLeftovers(chosen).sort(compareMeals),
    generatedBy: "heuristic",
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Re-pick the named meals whose dish no longer fits the time their slot allows.
 *
 * A leftover only fits a rushed slot because it is reheated. Once its source
 * dish is swapped or removed the link is cut and the meal would have to be
 * cooked, so a 40 minute dish can end up in a "very little time" slot. This
 * gives such meals a dish that fits. It touches only slots the user's weekly
 * schedule caps, and never a locked meal or one that is already done.
 */
export function fitMealsToSchedule(
  plan: MealPlan,
  mealIds: readonly ID[],
  ctx: PlannerContext,
): MealPlan {
  const { profile } = ctx;
  const targets = new Set(mealIds);
  const recipeById = new Map<ID, Recipe>(ctx.recipes.map((r) => [r.id, r]));
  const allowed = ctx.recipes.filter((r) => isPlannable(r, profile));
  const weeklyBudget = (profile.budgetMonthly || 0) / WEEKS_PER_MONTH;
  const planEnd = addDays(plan.weekStart, DAYS_PER_WEEK - 1);
  const shopDate =
    ctx.today && ctx.today > plan.weekStart && ctx.today <= planEnd
      ? ctx.today
      : plan.weekStart;
  const expiring = expiringStock(
    ctx.pantry ?? [],
    ctx.today ?? plan.weekStart,
    WASTE_WINDOW_DAYS,
    ctx.ingredients,
  );
  const ingredientById = ctx.ingredients?.length
    ? indexIngredients(ctx.ingredients)
    : undefined;
  const rng = mulberry32(hashSeed(plan.id, "fit-to-schedule"));

  const meals: PlannedMeal[] = plan.meals.map((m) => ({ ...m }));
  const spentElsewhere = (exclude: PlannedMeal): number =>
    meals.reduce((sum, m) => {
      if (m === exclude || m.status === "skipped") return sum;
      const r = recipeById.get(m.recipeId);
      return sum + (r ? (r.costPerServing ?? 0) * m.servings : 0);
    }, 0);

  let changed = false;
  for (const meal of meals) {
    if (!targets.has(meal.id) || meal.locked || meal.status !== "planned") continue;
    if (meal.leftoverOf) continue; // reheating needs no cooking time

    const slot: MealSlot = {
      date: meal.date,
      mealType: meal.mealType,
      dayIndex: clamp(daysBetween(plan.weekStart, meal.date), 0, DAYS_PER_WEEK - 1),
    };
    if (!scheduledTime(profile, slot)) continue; // no explicit limit to honour

    const current = recipeById.get(meal.recipeId);
    if (current && totalMinutes(current) <= slotTimeLimit(profile, slot)) continue;

    const best = bestOf(candidatesForSlot(allowed, slot, profile), slot, {
      profile,
      preferences: ctx.preferences,
      expiring,
      chosen: meals.filter((m) => m !== meal),
      recipeById,
      weeklyBudget,
      spentSoFar: spentElsewhere(meal),
      remainingMeals: 1,
      servings: meal.servings,
      rng,
      ingredientById,
      shopDate,
    });
    if (best && best.id !== meal.recipeId) {
      meal.recipeId = best.id;
      changed = true;
    }
  }

  if (!changed) return plan;
  return { ...plan, meals: sanitizeLeftovers(meals), updatedAt: nowIso() };
}

// ---------------------------------------------------------------------------
// Adaptation
// ---------------------------------------------------------------------------

function moodSpecFor(moodTags: readonly string[] | undefined): {
  match: (r: Recipe) => boolean;
  bias: Partial<Record<RecipeTag, number>>;
} {
  const bias: Partial<Record<RecipeTag, number>> = {};
  const matchers: NonNullable<MoodSpec["match"]>[] = [];
  for (const raw of moodTags ?? []) {
    const key = normalizeText(raw).replace(/ /g, "_");
    const spec = MOOD_SPECS[key];
    if (!spec) continue;
    for (const t of spec.tags) bias[t] = clamp((bias[t] ?? 0) + 0.5, -1, 1);
    if (spec.match) matchers.push(spec.match);
  }
  return {
    match: (r) => matchers.every((fn) => fn(r)),
    bias,
  };
}

export function adaptPlan(
  plan: MealPlan,
  change: ScheduleChange,
  ctx: PlannerContext,
): MealPlan {
  const { profile } = ctx;
  const meals: PlannedMeal[] = plan.meals.map((m) => ({ ...m }));
  const recipeById = new Map<ID, Recipe>(ctx.recipes.map((r) => [r.id, r]));
  const allowed = ctx.recipes.filter((r) => isPlannable(r, profile));
  const weeklyBudget = (profile.budgetMonthly || 0) / WEEKS_PER_MONTH;
  const expiring = expiringStock(ctx.pantry ?? [], change.date, WASTE_WINDOW_DAYS);
  const rng = mulberry32(hashSeed(plan.id, change.id, change.type, change.date));
  const ingredientById = ctx.ingredients?.length
    ? indexIngredients(ctx.ingredients)
    : undefined;
  const planEnd = addDays(plan.weekStart, DAYS_PER_WEEK - 1);
  const shopDate =
    ctx.today && ctx.today > plan.weekStart && ctx.today <= planEnd
      ? ctx.today
      : plan.weekStart;

  const editable = (m: PlannedMeal): boolean =>
    !m.locked && m.status === "planned" && m.date >= change.date;

  const spentElsewhere = (exclude: PlannedMeal): number => {
    let total = 0;
    for (const m of meals) {
      if (m === exclude || m.status === "skipped") continue;
      const r = recipeById.get(m.recipeId);
      if (r) total += (r.costPerServing ?? 0) * m.servings;
    }
    return total;
  };

  const editableCount = meals.filter(editable).length;

  /** Re-pick a recipe for `meal`, preferring candidates that pass `prefer`. */
  const repick = (
    meal: PlannedMeal,
    prefer: (r: Recipe) => boolean,
    bias?: Partial<Record<RecipeTag, number>>,
    waiveCompleteMeal = false,
  ): Recipe | undefined => {
    const slot: MealSlot = {
      date: meal.date,
      mealType: meal.mealType,
      dayIndex: clamp(daysBetween(plan.weekStart, meal.date), 0, DAYS_PER_WEEK - 1),
    };
    const pool = candidatesFor(allowed, meal.mealType);
    const preferred = pool.filter(prefer);
    const finalPool = preferred.length > 0 ? preferred : pool;
    if (finalPool.length === 0) return undefined;
    const sctx: ScoreContext = {
      profile,
      preferences: ctx.preferences,
      expiring,
      chosen: meals.filter((m) => m.id !== meal.id),
      recipeById,
      weeklyBudget,
      spentSoFar: spentElsewhere(meal),
      remainingMeals: Math.max(1, editableCount),
      servings: meal.servings,
      tagBias: bias,
      rng,
      ingredientById,
      shopDate,
      waiveCompleteMeal,
    };
    return bestOf(finalPool, slot, sctx);
  };

  /** Meals the change applies to. */
  const targets = (fallback?: MealType): PlannedMeal[] => {
    const mealType = change.mealType ?? fallback;
    return meals.filter(
      (m) => m.date === change.date && editable(m) && (!mealType || m.mealType === mealType),
    );
  };

  switch (change.type) {
    case "skip_meal": {
      for (const m of targets("dinner")) {
        const idx = meals.indexOf(m);
        if (idx >= 0) meals.splice(idx, 1);
      }
      break;
    }

    case "eating_out": {
      const out = targets("dinner");
      for (const m of out) m.status = "eating_out";
      if (profile.goal === "weight_loss") {
        const outIds = new Set(out.map((m) => m.id));
        for (const m of meals) {
          if (m.date !== change.date || outIds.has(m.id) || !editable(m)) continue;
          const cap = kcalTargetFor(profile, m.mealType) * EATING_OUT_KCAL_FACTOR;
          const r = repick(
            m,
            (rr) => (rr.nutritionPerServing?.kcal ?? 0) <= cap,
            { low_cal: 0.5, high_fiber: 0.2 },
          );
          if (r) m.recipeId = r.id;
        }
      }
      break;
    }

    case "guests": {
      const guests = Math.max(0, change.guestCount ?? 0);
      const factor = 1 + guests / Math.max(1, profile.servingsDefault || 1);
      for (const m of targets()) {
        m.servings = Math.max(1, roundToHalf(m.servings * factor));
        const r = repick(m, (rr) => (rr.tags ?? []).includes("guest_friendly"), {
          guest_friendly: 0.6,
        });
        if (r && (r.tags ?? []).includes("guest_friendly")) m.recipeId = r.id;
      }
      break;
    }

    case "less_time": {
      const limit = change.availableMinutes ?? TIME_LIMIT_MIN.medium;
      const fits = (r: Recipe) => (r.prepTimeMin ?? 0) + (r.cookTimeMin ?? 0) <= limit;
      for (const m of targets()) {
        // A leftover only needs reheating, which fits any realistic limit.
        if (m.leftoverOf && limit >= REHEAT_MIN) continue;
        const current = recipeById.get(m.recipeId);
        if (current && fits(current)) continue;
        const r = repick(m, fits, { quick: 0.5 });
        if (r && fits(r)) m.recipeId = r.id;
      }
      break;
    }

    case "mood_change": {
      const spec = moodSpecFor(change.moodTags);
      const wantsLight = (change.moodTags ?? []).some((t) =>
        LIGHT_MOODS.includes(normalizeText(t).replace(/ /g, "_")),
      );
      for (const m of targets()) {
        const r = repick(m, spec.match, spec.bias, wantsLight);
        if (r) m.recipeId = r.id;
      }
      break;
    }
  }

  return {
    ...plan,
    meals: sanitizeLeftovers(meals.sort(compareMeals)),
    updatedAt: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Diffing (the "Re-optimise" review screen)
// ---------------------------------------------------------------------------

export function diffPlans(before: MealPlan, after: MealPlan): MealDiff[] {
  const out: MealDiff[] = [];
  const afterById = new Map(after.meals.map((m) => [m.id, m]));
  const afterByKey = new Map(
    after.meals.map((m) => [slotKey(m.date, m.mealType), m]),
  );
  const beforeIds = new Set(before.meals.map((m) => m.id));
  const matched = new Set<ID>();

  for (const b of before.meals) {
    const a = afterById.get(b.id) ?? afterByKey.get(slotKey(b.date, b.mealType));
    if (!a) {
      out.push({
        mealId: b.id,
        date: b.date,
        mealType: b.mealType,
        fromRecipeId: b.recipeId,
        fromServings: b.servings,
      });
      continue;
    }
    matched.add(a.id);
    const diff: MealDiff = { mealId: a.id, date: a.date, mealType: a.mealType };
    let changed = false;
    if (a.recipeId !== b.recipeId) {
      diff.fromRecipeId = b.recipeId;
      diff.toRecipeId = a.recipeId;
      changed = true;
    }
    if (a.servings !== b.servings) {
      diff.fromServings = b.servings;
      diff.toServings = a.servings;
      changed = true;
    }
    if (a.status !== b.status) {
      diff.statusChange = { from: b.status, to: a.status };
      changed = true;
    }
    if (changed) out.push(diff);
  }

  for (const a of after.meals) {
    if (matched.has(a.id) || beforeIds.has(a.id)) continue;
    out.push({
      mealId: a.id,
      date: a.date,
      mealType: a.mealType,
      toRecipeId: a.recipeId,
      toServings: a.servings,
    });
  }

  return out.sort((x, y) =>
    x.date === y.date
      ? MEAL_ORDER[x.mealType] - MEAL_ORDER[y.mealType]
      : x.date < y.date
        ? -1
        : 1,
  );
}
