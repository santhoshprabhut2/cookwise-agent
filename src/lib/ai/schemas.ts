/**
 * Zod contracts for every `/api/ai/*` route plus the matching Gemini
 * `responseSchema` objects (ARCHITECTURE §6).
 *
 * This module is imported by the route handlers at runtime and by
 * `src/lib/ai/client.ts` with `import type` only, so it must stay free of any
 * value import from `@google/genai` (the SDK must never reach the browser).
 * The Gemini schemas are therefore plain objects described by `GeminiSchema`;
 * `GenerateContentConfig.responseSchema` accepts them as-is.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Gemini structured-output schema (a minimal OpenAPI subset, no SDK import)
// ---------------------------------------------------------------------------

export type GeminiSchema = {
  type: "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN" | "ARRAY" | "OBJECT";
  description?: string;
  enum?: string[];
  format?: string;
  nullable?: boolean;
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
};

const S = (description?: string): GeminiSchema => ({ type: "STRING", description });
const N = (description?: string): GeminiSchema => ({ type: "NUMBER", description });
const I = (description?: string): GeminiSchema => ({ type: "INTEGER", description });
const B = (description?: string): GeminiSchema => ({ type: "BOOLEAN", description });
const E = (values: readonly string[], description?: string): GeminiSchema => ({
  type: "STRING",
  format: "enum",
  enum: [...values],
  description,
});

// ---------------------------------------------------------------------------
// Domain enums (mirroring src/lib/types.ts)
// ---------------------------------------------------------------------------

export const UNITS = ["g", "ml", "pcs"] as const;
export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export const DIETS = [
  "vegetarian",
  "non_vegetarian",
  "vegan",
  "eggetarian",
  "pescatarian",
] as const;
export const GOALS = [
  "muscle_gain",
  "weight_loss",
  "maintenance",
  "improve_energy",
  "balanced",
] as const;
export const SKILLS = ["beginner", "intermediate", "advanced"] as const;
export const TIME_AVAILABILITY = ["low", "medium", "high", "varies"] as const;
export const PRIORITIES = [
  "nutrition",
  "time",
  "budget",
  "taste",
  "waste_reduction",
] as const;
export const EQUIPMENT = [
  "stove",
  "oven",
  "microwave",
  "pressure_cooker",
  "mixer",
  "blender",
  "air_fryer",
  "frying_pan",
  "kadai",
  "dosa_pan",
  "tawa",
  "steamer",
  "rice_cooker",
  "sensor_dock",
] as const;
export const RECIPE_TAGS = [
  "high_protein",
  "quick",
  "low_cal",
  "high_fiber",
  "budget",
  "comfort",
  "one_pot",
  "kid_friendly",
  "guest_friendly",
  "batch_friendly",
  "complete_meal",
  "staple",
] as const;
export const PANTRY_SOURCES = [
  "manual",
  "scan",
  "sensor",
  "receipt",
  "grocery",
] as const;
export const PLANNED_MEAL_STATUSES = [
  "planned",
  "cooked",
  "skipped",
  "eating_out",
] as const;
export const SCHEDULE_CHANGE_TYPES = [
  "less_time",
  "guests",
  "eating_out",
  "mood_change",
  "skip_meal",
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

/** Data-URI prefixes are stripped before validation by `stripDataUri`. */
const base64Image = z.string().min(16, "imageBase64 is empty");
const mimeType = z
  .string()
  .regex(/^image\/(png|jpe?g|webp|heic|heif|gif)$/i, "unsupported image type");

export const catalogEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

const catalogSchema = z.array(catalogEntrySchema).max(2000).default([]);

// ---------------------------------------------------------------------------
// /api/ai/identify
// ---------------------------------------------------------------------------

export const identifyRequestSchema = z.object({
  imageBase64: base64Image,
  mimeType: mimeType.default("image/jpeg"),
  catalog: catalogSchema,
});
export type IdentifyRequest = z.infer<typeof identifyRequestSchema>;

const alternativeSchema = z.object({
  ingredientId: z.string().optional(),
  name: z.string(),
  confidence: z.number().min(0).max(1),
});

export const identifyResultSchema = z.object({
  ingredientId: z.string().optional(),
  name: z.string().min(1),
  confidence: z.number().min(0).max(1),
  estimatedGrams: z.number().nonnegative().optional(),
  alternatives: z.array(alternativeSchema).max(5).default([]),
});
export type IdentifyResult = z.infer<typeof identifyResultSchema>;

export const identifyGeminiSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    ingredientId: S("Catalog id from the provided list, or \"\" when nothing matches."),
    name: S("Human-readable ingredient name, e.g. \"Tomato\"."),
    confidence: N("0..1 confidence in the primary match."),
    estimatedGrams: N("Rough weight of the visible quantity in grams, 0 if unclear."),
    alternatives: {
      type: "ARRAY",
      description: "Up to 3 other plausible matches, best first.",
      items: {
        type: "OBJECT",
        properties: {
          ingredientId: S("Catalog id or \"\"."),
          name: S(),
          confidence: N("0..1"),
        },
        required: ["name", "confidence"],
      },
    },
  },
  required: ["name", "confidence", "alternatives"],
  propertyOrdering: [
    "ingredientId",
    "name",
    "confidence",
    "estimatedGrams",
    "alternatives",
  ],
};

// ---------------------------------------------------------------------------
// /api/ai/receipt
// ---------------------------------------------------------------------------

export const receiptRequestSchema = z.object({
  imageBase64: base64Image,
  mimeType: mimeType.default("image/jpeg"),
  catalog: catalogSchema,
});
export type ReceiptRequest = z.infer<typeof receiptRequestSchema>;

export const receiptResultSchema = z.object({
  items: z
    .array(
      z.object({
        ingredientId: z.string().optional(),
        name: z.string().min(1),
        quantity: z.number().nonnegative(),
        unit: z.enum(UNITS),
        price: z.number().nonnegative().optional(),
      }),
    )
    .max(80)
    .default([]),
  store: z.string().optional(),
  total: z.number().nonnegative().optional(),
});
export type ReceiptResult = z.infer<typeof receiptResultSchema>;

export const receiptGeminiSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      description: "One entry per grocery line item. Skip non-food lines.",
      items: {
        type: "OBJECT",
        properties: {
          ingredientId: S("Catalog id from the provided list, or \"\"."),
          name: S("Line item name, cleaned up."),
          quantity: N("Amount bought in the given unit."),
          unit: E(UNITS, "g for solids, ml for liquids, pcs for countable items."),
          price: N("Line price in rupees, 0 when not printed."),
        },
        required: ["name", "quantity", "unit"],
      },
    },
    store: S("Store name printed on the receipt, or \"\"."),
    total: N("Receipt total in rupees, 0 when not printed."),
  },
  required: ["items"],
  propertyOrdering: ["items", "store", "total"],
};

// ---------------------------------------------------------------------------
// Shared domain fragments
// ---------------------------------------------------------------------------

/** Mirrors `NutritionPer100` / `NutritionPerServing`. */
export const nutritionSchema = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  vitaminCMg: z.number().optional(),
  vitaminB6Mg: z.number().optional(),
  folateUg: z.number().optional(),
  vitaminAUg: z.number().optional(),
  ironMg: z.number().optional(),
  calciumMg: z.number().optional(),
  potassiumMg: z.number().optional(),
});

export const profileSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  age: z.number().optional(),
  city: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  heightCm: z.number().optional(),
  weightKg: z.number().optional(),
  avatarUrl: z.string().optional(),
  diet: z.enum(DIETS),
  allergies: z.array(z.string()).default([]),
  restrictions: z.array(z.string()).default([]),
  goal: z.enum(GOALS),
  dailyCalorieTarget: z.number(),
  proteinTargetG: z.number(),
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  favoriteFoods: z.array(z.string()).default([]),
  dislikedIngredients: z.array(z.string()).default([]),
  cuisines: z.array(z.string()).default([]),
  spiceLevel: z.number().int().min(1).max(5),
  budgetMonthly: z.number().default(0),
  currency: z.literal("INR").default("INR"),
  skill: z.enum(SKILLS),
  timeAvailability: z.enum(TIME_AVAILABILITY),
  // Zod 4 record() over an enum key is exhaustive; partialRecord() allows gaps.
  timeSchedule: z
    .partialRecord(
      z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
      z.partialRecord(
        z.enum(["breakfast", "lunch", "dinner"]),
        z.enum(["very_little", "little", "some", "plenty"]),
      ),
    )
    .optional(),
  priorities: z.array(z.enum(PRIORITIES)).default([]),
  servingsDefault: z.number().int().positive().default(2),
  onboardingComplete: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const pantryItemSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  ingredientId: z.string(),
  name: z.string(),
  quantity: z.number(),
  unit: z.enum(UNITS),
  addedAt: z.string().optional(),
  expiresAt: isoDate,
  source: z.enum(PANTRY_SOURCES).optional(),
  updatedAt: z.string().optional(),
});

export const preferenceModelSchema = z.object({
  userId: z.string().optional(),
  recipeScores: z.record(z.string(), z.number()).default({}),
  ingredientAffinity: z.record(z.string(), z.number()).default({}),
  cuisineAffinity: z.record(z.string(), z.number()).default({}),
  tagAffinity: z.record(z.string(), z.number()).default({}),
  spiceAdjust: z.number().default(0),
  portionAdjust: z.number().default(1),
  feedbackCount: z.number().default(0),
  updatedAt: z.string().optional(),
});

export const plannedMealSchema = z.object({
  id: z.string(),
  planId: z.string(),
  date: isoDate,
  mealType: z.enum(MEAL_TYPES),
  recipeId: z.string(),
  servings: z.number().positive(),
  locked: z.boolean().default(false),
  status: z.enum(PLANNED_MEAL_STATUSES).default("planned"),
  note: z.string().optional(),
  leftoverOf: z.string().optional(),
});

export const scheduleChangeSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  type: z.enum(SCHEDULE_CHANGE_TYPES),
  date: isoDate,
  mealType: z.enum(MEAL_TYPES).optional(),
  availableMinutes: z.number().optional(),
  guestCount: z.number().optional(),
  moodTags: z.array(z.string()).default([]),
  note: z.string().optional(),
  createdAt: z.string().optional(),
});

/** Compact recipe row sent to Gemini instead of the full recipe object. */
export const recipeSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  mealTypes: z.array(z.enum(MEAL_TYPES)).default([]),
  tags: z.array(z.enum(RECIPE_TAGS)).default([]),
  kcal: z.number().default(0),
  protein: z.number().default(0),
  minutes: z.number().default(0),
  cost: z.number().default(0),
  diets: z.array(z.enum(DIETS)).default([]),
  spiceLevel: z.number().int().min(1).max(5).optional(),
  cuisine: z.string().optional(),
  equipment: z.array(z.enum(EQUIPMENT)).default([]),
  ingredientIds: z.array(z.string()).default([]),
});
export type RecipeSummary = z.infer<typeof recipeSummarySchema>;

// ---------------------------------------------------------------------------
// /api/ai/meal-plan
// ---------------------------------------------------------------------------

export const mealPlanRequestSchema = z.object({
  planId: z.string().optional(),
  profile: profileSchema,
  weekStart: isoDate,
  pantry: z.array(pantryItemSchema).max(300).default([]),
  preferences: preferenceModelSchema.optional(),
  lockedMeals: z.array(plannedMealSchema).max(40).default([]),
  changes: z.array(scheduleChangeSchema).max(40).default([]),
  recipes: z.array(recipeSummarySchema).min(1).max(500),
});
export type AiMealPlanRequest = z.infer<typeof mealPlanRequestSchema>;

/** What Gemini is asked to produce — ids only; the route hydrates the rest. */
export const mealDraftSchema = z.object({
  date: isoDate,
  mealType: z.enum(MEAL_TYPES),
  recipeId: z.string().min(1),
  servings: z.number().positive().max(20),
});
export type MealDraft = z.infer<typeof mealDraftSchema>;

export const mealDraftListSchema = z.object({
  meals: z.array(mealDraftSchema).max(60),
  rationale: z.string().optional(),
});

export const mealPlanResponseSchema = z.object({
  meals: z.array(plannedMealSchema),
  generatedBy: z.literal("gemini"),
  dropped: z.number().int().nonnegative(),
  rationale: z.string().optional(),
});
export type AiMealPlanResponse = z.infer<typeof mealPlanResponseSchema>;

export const mealPlanGeminiSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    meals: {
      type: "ARRAY",
      description:
        "Exactly 21 entries: breakfast, lunch and dinner for each of the 7 dates.",
      items: {
        type: "OBJECT",
        properties: {
          date: S("YYYY-MM-DD, one of the seven week dates."),
          mealType: E(MEAL_TYPES),
          recipeId: S("MUST be one of the recipe ids supplied in the prompt."),
          servings: I("Number of servings to cook."),
        },
        required: ["date", "mealType", "recipeId", "servings"],
      },
    },
    rationale: S("One short sentence about the plan's overall strategy."),
  },
  required: ["meals"],
  propertyOrdering: ["meals", "rationale"],
};

// ---------------------------------------------------------------------------
// /api/ai/adapt
// ---------------------------------------------------------------------------

export const adaptRequestSchema = z.object({
  plan: z.object({
    id: z.string(),
    weekStart: isoDate,
    meals: z.array(plannedMealSchema).max(60),
  }),
  change: scheduleChangeSchema,
  profile: profileSchema,
  pantry: z.array(pantryItemSchema).max(300).default([]),
  recipes: z.array(recipeSummarySchema).min(1).max(500),
  preferences: preferenceModelSchema.optional(),
});
export type AiAdaptRequest = z.infer<typeof adaptRequestSchema>;

/** Gemini returns only the meals it changed. */
export const adaptDraftSchema = z.object({
  id: z.string().min(1),
  recipeId: z.string().min(1),
  servings: z.number().positive().max(20),
  status: z.enum(PLANNED_MEAL_STATUSES).default("planned"),
  note: z.string().optional(),
});

export const adaptDraftListSchema = z.object({
  meals: z.array(adaptDraftSchema).max(60),
  rationale: z.string().optional(),
});

export const adaptResponseSchema = z.object({
  meals: z.array(plannedMealSchema),
  generatedBy: z.literal("gemini"),
  dropped: z.number().int().nonnegative(),
  rationale: z.string().optional(),
});
export type AiAdaptResponse = z.infer<typeof adaptResponseSchema>;

export const adaptGeminiSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    meals: {
      type: "ARRAY",
      description: "ONLY the meals you changed. Never include locked meals.",
      items: {
        type: "OBJECT",
        properties: {
          id: S("The existing planned-meal id you are changing."),
          recipeId: S("MUST be one of the recipe ids supplied in the prompt."),
          servings: I("Servings after the change."),
          status: E(PLANNED_MEAL_STATUSES, "Use eating_out or skipped where relevant."),
          note: S("Short reason shown to the user, or \"\"."),
        },
        required: ["id", "recipeId", "servings", "status"],
      },
    },
    rationale: S("One short sentence explaining the adaptation."),
  },
  required: ["meals"],
  propertyOrdering: ["meals", "rationale"],
};

// ---------------------------------------------------------------------------
// /api/ai/cooking-state
// ---------------------------------------------------------------------------

export const cookingStateRequestSchema = z.object({
  imageBase64: base64Image,
  mimeType: mimeType.default("image/jpeg"),
  stateCue: z.string().min(1).max(400),
  stepTitle: z.string().max(200).optional(),
  recipeName: z.string().max(200).optional(),
});
export type CookingStateRequest = z.infer<typeof cookingStateRequestSchema>;

export const cookingStateResultSchema = z.object({
  matches: z.boolean(),
  confidence: z.number().min(0).max(1),
  advice: z.string().default(""),
});
export type CookingStateResult = z.infer<typeof cookingStateResultSchema>;

export const cookingStateGeminiSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    matches: B("True when the pan already looks like the described cue."),
    confidence: N("0..1 confidence."),
    advice: S("One short actionable sentence for the cook."),
  },
  required: ["matches", "confidence", "advice"],
  propertyOrdering: ["matches", "confidence", "advice"],
};

// ---------------------------------------------------------------------------
// /api/ai/status
// ---------------------------------------------------------------------------

export const aiStatusSchema = z.object({
  gemini: z.boolean(),
  ml: z.boolean(),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Max decoded image size accepted by the routes (4 MB). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Accepts `data:image/png;base64,AAA…` as well as a bare base64 payload. */
export function stripDataUri(input: string): { base64: string; mimeType?: string } {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(input.trim());
  if (m) return { base64: m[2], mimeType: m[1] };
  return { base64: input.trim() };
}

/** Approximate decoded byte length of a base64 string without decoding it. */
export function base64Bytes(b64: string): number {
  const clean = b64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}
