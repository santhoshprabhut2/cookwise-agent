/**
 * Tunable constants for the Cookwise engines.
 *
 * Everything the heuristics depend on lives here so a product person can read
 * (and a test can pin) the numbers without digging through the algorithms.
 */

import type {
  Equipment,
  ID,
  IngredientCategory,
  MealType,
  Priority,
  Recipe,
  RecipeTag,
  ScheduledMealType,
  SkillLevel,
  SlotTime,
  TimeAvailability,
  WeekdayKey,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** The three slots a week plan fills for every day. */
export const PLAN_MEAL_TYPES: readonly MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
] as const;

export const DAYS_PER_WEEK = 7;
export const SLOTS_PER_WEEK = DAYS_PER_WEEK * PLAN_MEAL_TYPES.length; // 21

/** Share of the daily calorie target that belongs to each slot. */
export const MEAL_KCAL_SPLIT: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.4,
  dinner: 0.35,
  snack: 0.1,
};

/** Weight given to the 1st, 2nd, … priority in `profile.priorities`. Sums to 1. */
export const PRIORITY_WEIGHTS: readonly number[] = [0.35, 0.25, 0.2, 0.12, 0.08];

/** Used to back-fill priorities the user did not rank. */
export const DEFAULT_PRIORITY_ORDER: readonly Priority[] = [
  "nutrition",
  "time",
  "budget",
  "taste",
  "waste_reduction",
] as const;

/** Total prep+cook minutes tolerated per `timeAvailability`. */
export const TIME_LIMIT_MIN: Record<TimeAvailability, number> = {
  low: 20,
  medium: 35,
  high: Number.POSITIVE_INFINITY,
  /** "varies" is treated as `medium`-ish on weekdays and unrestricted at weekends. */
  varies: 30,
};

/** Monday..Friday are dayIndex 0..4. */
export const LAST_WEEKDAY_INDEX = 4;

// ---------------------------------------------------------------------------
// Per-meal cooking time (UserProfile.timeSchedule)
// ---------------------------------------------------------------------------

/** `dayIndex` 0..6 (Monday first) → the key used in `UserProfile.timeSchedule`. */
export const WEEKDAY_KEYS: readonly WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

/** The meals a weekly time schedule covers. */
export const SCHEDULED_MEAL_TYPES: readonly ScheduledMealType[] = [
  "breakfast",
  "lunch",
  "dinner",
] as const;

/** Total prep+cook minutes a slot allows, per `SlotTime`. */
export const SLOT_TIME_MIN: Record<SlotTime, number> = {
  very_little: 10,
  little: 20,
  some: 30,
  plenty: Number.POSITIVE_INFINITY,
};

/** Least to most time, the order the schedule editor cycles through. */
export const SLOT_TIME_ORDER: readonly SlotTime[] = [
  "very_little",
  "little",
  "some",
  "plenty",
] as const;

/** When no recipe fits a capped slot, offer only this many of the fastest ones. */
export const FASTEST_FALLBACK_COUNT = 3;

// ---------------------------------------------------------------------------
// Simple dishes
// ---------------------------------------------------------------------------

/**
 * How strongly "simple to cook" pulls on the time score, by skill. Beginners
 * get easy, short-ingredient-list dishes; experienced cooks are not nudged.
 */
export const SIMPLICITY_WEIGHT: Record<SkillLevel, number> = {
  beginner: 0.35,
  intermediate: 0.15,
  advanced: 0,
};

/** A recipe at or under these counts is as simple as it gets. */
export const SIMPLE_MAX_INGREDIENTS = 7;
export const SIMPLE_MAX_STEPS = 5;

// ---------------------------------------------------------------------------
// Complete meals
// ---------------------------------------------------------------------------

/**
 * A dish with at least this much carbohydrate per serving already includes its
 * staple (biryani, khichdi, curd rice, idli sambar), so it counts as a whole
 * meal without being tagged. Curries sit at 13 to 41 g and are not.
 */
export const COMPLETE_MEAL_MIN_CARBS_G = 50;

/**
 * Points off a lunch or dinner that is only a curry or a side. It is large on
 * purpose: a complete plate should win unless nothing complete is allowed.
 */
export const INCOMPLETE_MEAL_PENALTY = 30;

/**
 * Lunch and dinner are limited to whole plates only when at least this many are
 * on offer. With fewer, the restriction would force the same dish twice in a
 * day, so the softer `INCOMPLETE_MEAL_PENALTY` is left to do the work.
 */
export const MIN_WHOLE_PLATE_CHOICES = 5;

/** Moods that ask for something light, so a plate without a staple is wanted, not a gap. */
export const LIGHT_MOODS: readonly string[] = ["light", "no_cooking", "healthy"];

// ---------------------------------------------------------------------------
// Cook once, eat twice
// ---------------------------------------------------------------------------

/** A `batch_friendly` dish is only worth cooking double when it takes this long. */
export const BATCH_MIN_TOTAL_MIN = 30;

/** Minutes to warm a leftover. Fits even a "very little time" slot. */
export const REHEAT_MIN = 5;

/** Leftovers are only reused at these meals, never at breakfast. */
export const BATCH_MEAL_TYPES: readonly MealType[] = ["lunch", "dinner"];

/** Score bonus for any batch dish that can also feed the next lunch or dinner. */
export const BATCH_BASE_POINTS = 4;

/**
 * Extra bonus when that next meal is rushed (under `BATCH_MIN_TOTAL_MIN`
 * minutes available): a reheated leftover beats cooking a new dish in a hurry.
 */
export const BATCH_RELIEF_POINTS = 10;

// ---------------------------------------------------------------------------
// Freshness: use early spoilers first, re-buy the very perishable
// ---------------------------------------------------------------------------

/** Ingredients that keep longer than this never influence the order of meals. */
export const PERISHABLE_MAX_SHELF_DAYS = 7;

/** Points a perfectly fresh-ordered dish gains (or a badly ordered one loses). */
export const FRESHNESS_POINTS = 12;

/**
 * Items bought fresh every N days even though their catalog shelf life is a
 * little longer, because that is how people actually shop for them. Anything
 * else with a shelf life of `FRESH_BUY_MAX_SHELF_DAYS` or less is re-bought
 * every `shelfLifeDays` days automatically (chicken, fish, spinach, sprouts).
 */
export const FRESH_BUY_EVERY_DAYS: Record<ID, number> = {
  milk: 1,
  "coriander-leaves": 2,
  "mint-leaves": 2,
};

export const FRESH_BUY_MAX_SHELF_DAYS = 3;

/** A fresh purchase is rounded up to this many grams / ml (not a full pack). */
export const FRESH_ROUND_G = 50;

/** Equipment that any stove-owning kitchen can substitute for one another. */
export const BASIC_STOVE_EQUIPMENT: readonly Equipment[] = [
  "stove",
  "frying_pan",
  "kadai",
  "tawa",
] as const;

/** `budgetMonthly / WEEKS_PER_MONTH` is the weekly grocery allowance. */
export const WEEKS_PER_MONTH = 4.3;

/**
 * The week may cost at most this multiple of the weekly allowance. Past it the
 * planner offers only dishes that still leave enough for the meals left, so a
 * ₹5,000 month stays at ₹5,000 instead of being spent by Wednesday. Exactly 1:
 * the budget is a number the user typed, not a suggestion.
 */
export const BUDGET_CEILING = 1;

/** Pantry stock expiring within this many days earns a waste-reduction bonus. */
export const WASTE_WINDOW_DAYS = 4;

/** Grams of expiring stock that saturate the waste-reduction score. */
export const WASTE_SATURATION_G = 250;

/** Repeating a recipe within this many days is penalised. */
export const VARIETY_WINDOW_DAYS = 3;

/**
 * Points off for every earlier cook of the same recipe this week that is
 * outside the repeat window above. It stops the week falling into a short
 * cycle (Monday's meals returning on Friday). Leftovers do not count.
 */
export const VARIETY_WEEK_REPEAT_PENALTY = 6;

/** Penalty applied when the same recipe repeats on the same day. */
export const VARIETY_SAME_RECIPE_PENALTY = 40;
export const VARIETY_SAME_METHOD_PENALTY = 10;
export const VARIETY_SAME_CUISINE_PENALTY = 6;

/** Maximum points of seeded random jitter added to a score (breaks ties). */
export const SCORE_JITTER = 6;

/** Fallback when a `pcs` pantry item has no catalog entry. */
export const DEFAULT_GRAMS_PER_PIECE = 50;

/** Ingredients that read as "slow-release energy" for the improve_energy goal. */
export const ENERGY_INGREDIENT_HINTS: readonly string[] = [
  "oat",
  "oats",
  "banana",
  "ragi",
  "millet",
  "poha",
  "quinoa",
  "dates",
  "jaggery",
  "semolina",
  "rice",
  "barley",
] as const;

/** Short human phrase used by `explainMeal`. */
export const TAG_PHRASES: Partial<Record<RecipeTag, string>> = {
  high_protein: "high protein",
  low_cal: "light on calories",
  high_fiber: "high fibre",
  quick: "quick to make",
  budget: "budget friendly",
  comfort: "comfort food",
  one_pot: "one pot",
  kid_friendly: "kid friendly",
  guest_friendly: "great for guests",
  batch_friendly: "cook once, eat twice",
  complete_meal: "complete meal",
};

/** How a `ScheduleChange.moodTags` entry biases recipe selection. */
export interface MoodSpec {
  tags: RecipeTag[];
  /** Hard-ish preference; candidates matching it are tried first. */
  match?: (r: Recipe) => boolean;
}

export const MOOD_SPECS: Record<string, MoodSpec> = {
  // A light mood means a light dish, not just a nudge: low calorie or high fibre wins outright.
  light: {
    tags: ["low_cal", "high_fiber"],
    match: (r) => r.tags.includes("low_cal") || r.tags.includes("high_fiber"),
  },
  comfort: { tags: ["comfort", "one_pot"] },
  spicy: { tags: [], match: (r) => r.spiceLevel >= 3 },
  mild: { tags: [], match: (r) => r.spiceLevel <= 2 },
  no_cooking: {
    tags: ["quick"],
    match: (r) => r.prepTimeMin + r.cookTimeMin <= 10 || r.primaryMethod === "raw",
  },
  quick: { tags: ["quick"], match: (r) => r.prepTimeMin + r.cookTimeMin <= 20 },
  healthy: { tags: ["low_cal", "high_fiber", "high_protein"] },
  protein: { tags: ["high_protein"] },
  budget: { tags: ["budget"] },
};

/** When `eating_out` trims the rest of a weight-loss day. */
export const EATING_OUT_KCAL_FACTOR = 0.8;

// ---------------------------------------------------------------------------
// Allergens
// ---------------------------------------------------------------------------

/**
 * Allergy label (normalised: lowercase, alphanumeric only) → ingredient tokens.
 * Tokens are matched word-wise against ingredient ids and names, so "egg"
 * matches `egg` / "Eggs" but not "eggplant".
 */
export const ALLERGEN_TOKENS: Record<string, string[]> = {
  egg: ["egg"],
  eggs: ["egg"],
  dairy: [
    "milk",
    "curd",
    "yogurt",
    "yoghurt",
    "paneer",
    "ghee",
    "butter",
    "buttermilk",
    "cheese",
    "cream",
    "khoya",
  ],
  lactose: ["milk", "curd", "yogurt", "paneer", "ghee", "butter", "cheese", "cream"],
  milk: ["milk", "curd", "paneer", "ghee", "butter", "cheese", "cream"],
  nuts: [
    "peanut",
    "groundnut",
    "cashew",
    "almond",
    "walnut",
    "pistachio",
    "hazelnut",
    "pecan",
  ],
  treenuts: ["cashew", "almond", "walnut", "pistachio", "hazelnut", "pecan"],
  peanut: ["peanut", "groundnut"],
  peanuts: ["peanut", "groundnut"],
  gluten: [
    "wheat",
    "wheat flour",
    "maida",
    "atta",
    "bread",
    "pasta",
    "semolina",
    "rava",
    "barley",
    "rye",
  ],
  wheat: ["wheat", "wheat flour", "maida", "atta", "bread", "pasta", "semolina", "rava"],
  shellfish: ["prawn", "shrimp", "crab", "lobster", "squid"],
  soy: ["soy", "soya", "soya chunks", "soybean", "soyabean", "tofu"],
  soya: ["soy", "soya", "soya chunks", "soybean", "soyabean", "tofu"],
  fish: ["fish", "tuna", "salmon", "sardine", "mackerel", "pomfret"],
  sesame: ["sesame", "til"],
  mustard: ["mustard"],
};

// ---------------------------------------------------------------------------
// Grocery
// ---------------------------------------------------------------------------

/** Round a shortfall up to the next multiple of these grams / millilitres. */
export const PACK_SIZE_G: Record<IngredientCategory, number> = {
  spices: 50,
  oils: 200,
  grains: 500,
  legumes: 500,
  vegetables: 100,
  proteins: 250,
  dairy: 500,
  fruits: 100,
  nuts: 100,
  other: 100,
};

/** Per-ingredient overrides (ids that do not follow their category's pack size). */
export const PACK_SIZE_OVERRIDE_G: Record<ID, number> = {
  salt: 50,
  sugar: 500,
  "baking-soda": 50,
  // Dairy is sold in half-kilo tubs of curd, but not of these.
  butter: 100,
  paneer: 200,
  cheese: 200,
};

export const DEFAULT_PACK_SIZE_G = 100;
