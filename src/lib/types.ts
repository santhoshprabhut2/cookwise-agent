/**
 * Cookwise domain model.
 *
 * This file is the single source of truth for every entity in the app.
 * The Supabase schema (supabase/migrations), the local Dexie DB, the Zustand
 * stores and every screen import from here. Keep it dependency-free.
 *
 * Conventions
 * - All ids are strings (uuid v4 on the client, uuid in Postgres). Catalog
 *   ids (ingredients, public recipes) are human slugs like "tomato".
 * - All timestamps are ISO-8601 strings in UTC.
 * - Dates without time (plan days, expiry) are "YYYY-MM-DD".
 * - Weights are grams, volumes are millilitres, temperatures are Celsius,
 *   money is INR (whole rupees), durations are seconds unless the name says Min.
 */

export type ID = string;
export type ISODate = string; // "2026-09-15"
export type ISODateTime = string; // "2026-09-15T08:30:00.000Z"

// ---------------------------------------------------------------------------
// User profile / onboarding
// ---------------------------------------------------------------------------

export type DietType =
  | "vegetarian"
  | "non_vegetarian"
  | "vegan"
  | "eggetarian"
  | "pescatarian";

export type Goal =
  | "muscle_gain"
  | "weight_loss"
  | "maintenance"
  | "improve_energy"
  | "balanced";

export type SkillLevel = "beginner" | "intermediate" | "advanced";

export type Equipment =
  | "stove"
  | "oven"
  | "microwave"
  | "pressure_cooker"
  | "mixer"
  | "blender"
  | "air_fryer"
  | "frying_pan"
  | "kadai"
  | "dosa_pan"
  | "tawa"
  | "steamer"
  | "rice_cooker"
  | "sensor_dock";

export type Priority =
  | "nutrition"
  | "time"
  | "budget"
  | "taste"
  | "waste_reduction";

export type TimeAvailability = "low" | "medium" | "high" | "varies";

/**
 * How much time the user has to cook one specific meal.
 * very_little ≈ 10 min, little ≈ 20 min, some ≈ 30 min, plenty = no limit.
 */
export type SlotTime = "very_little" | "little" | "some" | "plenty";

export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** The meals a weekly time schedule covers. */
export type ScheduledMealType = "breakfast" | "lunch" | "dinner";

/**
 * Optional per-day, per-meal cooking time ("Thursday morning: very little").
 * Any missing cell falls back to the single `timeAvailability` setting.
 */
export type TimeSchedule = Partial<
  Record<WeekdayKey, Partial<Record<ScheduledMealType, SlotTime>>>
>;

/** 1 = no spice, 5 = very hot */
export type SpiceLevel = 1 | 2 | 3 | 4 | 5;

export interface UserProfile {
  id: ID;
  name: string;
  age?: number;
  city?: string;
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  heightCm?: number;
  weightKg?: number;
  avatarUrl?: string;

  diet: DietType;
  allergies: string[];
  restrictions: string[]; // e.g. "no_onion_garlic", "gluten_free", "low_sodium"

  goal: Goal;
  dailyCalorieTarget: number;
  proteinTargetG: number;

  equipment: Equipment[];

  favoriteFoods: string[]; // free text, e.g. "dosa", "biryani"
  dislikedIngredients: string[]; // ingredient ids
  cuisines: string[]; // e.g. "south_indian", "north_indian", "continental"
  spiceLevel: SpiceLevel;

  budgetMonthly: number; // INR
  currency: "INR";

  skill: SkillLevel;
  timeAvailability: TimeAvailability;
  /** Per-day, per-meal override of `timeAvailability`. Stored as one jsonb column. */
  timeSchedule?: TimeSchedule;
  /** Ordered, first = most important */
  priorities: Priority[];
  servingsDefault: number;

  onboardingComplete: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Ingredients & nutrition
// ---------------------------------------------------------------------------

export type IngredientCategory =
  | "vegetables"
  | "fruits"
  | "proteins"
  | "grains"
  | "dairy"
  | "legumes"
  | "spices"
  | "oils"
  | "nuts"
  | "other";

export type Unit = "g" | "ml" | "pcs";
export type StorageLocation = "fridge" | "freezer" | "pantry";

export type NutrientKey =
  | "kcal"
  | "proteinG"
  | "carbsG"
  | "fatG"
  | "fiberG"
  | "vitaminCMg"
  | "vitaminB6Mg"
  | "folateUg"
  | "vitaminAUg"
  | "ironMg"
  | "calciumMg"
  | "potassiumMg";

/** Nutrition per 100 g (or 100 ml) of the raw ingredient. */
export type NutritionPer100 = Partial<Record<NutrientKey, number>> & {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
};

/** Absolute nutrition for one serving of a recipe. Same keys as NutritionPer100. */
export type NutritionPerServing = NutritionPer100;

/** Catalog entry (shared, not user-specific). */
export interface Ingredient {
  id: ID; // slug, e.g. "tomato"
  name: string;
  category: IngredientCategory;
  emoji: string;
  imageUrl?: string;
  defaultUnit: Unit;
  /** Average grams for one piece; required when defaultUnit is "pcs". */
  gramsPerPiece?: number;
  /** Typical shelf life once bought, used to default expiry. */
  shelfLifeDays: number;
  storage: StorageLocation;
  costPerKg: number; // INR per kg (or per litre)
  nutrition: NutritionPer100;
  aliases: string[];
}

// ---------------------------------------------------------------------------
// Pantry
// ---------------------------------------------------------------------------

export type PantrySource =
  | "manual"
  | "scan" // camera + Gemini
  | "sensor" // camera + scale dock
  | "receipt"
  | "grocery"; // moved from a purchased grocery list

export interface PantryItem {
  id: ID;
  userId: ID;
  ingredientId: ID;
  /** Denormalised display name so the row renders without the catalog. */
  name: string;
  quantity: number;
  unit: Unit;
  addedAt: ISODateTime;
  expiresAt: ISODate;
  source: PantrySource;
  updatedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export type CookingMethod =
  | "raw"
  | "boil"
  | "steam"
  | "saute"
  | "stir_fry"
  | "shallow_fry"
  | "deep_fry"
  | "bake"
  | "roast"
  | "grill"
  | "pressure_cook"
  | "simmer"
  | "microwave";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Difficulty = "easy" | "medium" | "hard";

export type RecipeTag =
  | "high_protein"
  | "quick"
  | "low_cal"
  | "high_fiber"
  | "budget"
  | "comfort"
  | "one_pot"
  | "kid_friendly"
  | "guest_friendly"
  /** Long to cook but keeps and reheats well, so it can feed two meals. */
  | "batch_friendly"
  /** A whole plate: a main dish with the rice, chapati or other staple it is eaten with. */
  | "complete_meal"
  /** Rice, chapati and the like. Eaten with a main dish, so never planned on its own. */
  | "staple";

export interface RecipeIngredient {
  ingredientId: ID;
  name: string;
  quantity: number;
  unit: Unit;
  /** Always present so the scale can verify, even when unit is pcs. */
  grams: number;
  optional?: boolean;
  prep?: string; // "finely chopped"
}

export interface RecipeStep {
  id: ID;
  order: number;
  title: string; // "Add onions and cook"
  instruction: string;
  method?: CookingMethod;
  durationSec?: number;
  /** Target pan temperature range for this step. */
  targetTempC?: { min: number; max: number };
  /** Ingredients the user must add during this step; drives live scale feedback. */
  addIngredients?: { ingredientId: ID; grams: number }[];
  tip?: string;
  /** Visual cue the user (or a vision model) checks for, e.g. "onions golden brown". */
  stateCue?: string;
}

export interface Recipe {
  id: ID;
  name: string;
  description: string;
  cuisine: string;
  mealTypes: MealType[];
  tags: RecipeTag[];
  emoji: string;
  imageUrl?: string;
  servings: number;
  prepTimeMin: number;
  cookTimeMin: number;
  difficulty: Difficulty;
  spiceLevel: SpiceLevel;
  /** Diets this recipe is compatible with. */
  diets: DietType[];
  equipment: Equipment[];
  primaryMethod: CookingMethod;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  nutritionPerServing: NutritionPerServing;
  costPerServing: number; // INR
  /** true for catalog recipes; false for user-created or AI-generated. */
  isPublic: boolean;
  createdBy?: ID;
}

// ---------------------------------------------------------------------------
// Meal planning
// ---------------------------------------------------------------------------

export type PlannedMealStatus =
  | "planned"
  | "cooked"
  | "skipped"
  | "eating_out";

export interface PlannedMeal {
  id: ID;
  planId: ID;
  date: ISODate;
  mealType: MealType;
  recipeId: ID;
  servings: number;
  locked: boolean;
  status: PlannedMealStatus;
  note?: string;
  /**
   * Set when this meal re-serves a dish cooked for another planned meal
   * ("cook once, eat twice"). Points at the meal the dish is cooked for.
   * Nothing is cooked for a leftover meal, only reheated.
   */
  leftoverOf?: ID;
}

export interface MealPlan {
  id: ID;
  userId: ID;
  weekStart: ISODate; // Monday
  meals: PlannedMeal[];
  generatedBy: "heuristic" | "gemini";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** One shopping trip for a fresh, short-lived item. */
export interface FreshBuyVisit {
  date: ISODate;
  grams: number;
  /** In the item's own unit (pieces for `pcs`, otherwise grams or ml). */
  quantity: number;
  /** Ticked off on the shopping list. */
  purchased?: boolean;
  /** Already moved into the pantry. */
  addedToPantry?: boolean;
}

/**
 * Milk, meat and herbs spoil before a week is over, so they are bought in
 * several small trips instead of one weekly shop.
 */
export interface FreshBuyPlan {
  /** Buy again at least this often while the plan still needs it (1 = daily). */
  everyDays: number;
  visits: FreshBuyVisit[];
}

export interface GroceryItem {
  id: ID;
  listId: ID;
  ingredientId: ID;
  name: string;
  quantity: number;
  unit: Unit;
  grams: number;
  estimatedCost: number; // INR
  /** INR of this item the plan actually uses up, before pack-size rounding. */
  usedCost?: number;
  /** Present for fresh items that should be bought in several trips. */
  fresh?: FreshBuyPlan;
  purchased: boolean;
  addedToPantry: boolean;
}

export interface GroceryList {
  id: ID;
  userId: ID;
  planId?: ID;
  items: GroceryItem[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A change in the user's situation that triggers re-planning. */
export type ScheduleChangeType =
  | "less_time"
  | "guests"
  | "eating_out"
  | "mood_change"
  | "skip_meal";

export interface ScheduleChange {
  id: ID;
  userId: ID;
  type: ScheduleChangeType;
  date: ISODate;
  mealType?: MealType;
  availableMinutes?: number;
  guestCount?: number;
  moodTags?: string[]; // "light", "comfort", "spicy", "no_cooking"
  note?: string;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Cooking sessions & sensors
// ---------------------------------------------------------------------------

export interface SensorReading {
  weightG: number;
  /** True once the weight has settled. */
  stable: boolean;
  tempC?: number;
  ts: number; // Date.now()
}

export interface TempSample {
  t: number; // ms since session start
  tempC: number;
}

export type VerificationMethod = "scale" | "camera_scale" | "manual";

export interface IngredientLog {
  ingredientId: ID;
  targetGrams: number;
  actualGrams: number;
  verifiedBy: VerificationMethod;
  /** Gemini vision label when a camera was used. */
  identifiedAs?: string;
  confidence?: number;
  ts: ISODateTime;
}

export interface StepLog {
  stepId: ID;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  avgTempC?: number;
  maxTempC?: number;
  durationSec?: number;
}

export type CookSessionStatus =
  | "verifying"
  | "cooking"
  | "completed"
  | "abandoned";

export interface CookSession {
  id: ID;
  userId: ID;
  recipeId: ID;
  plannedMealId?: ID;
  servings: number;
  status: CookSessionStatus;
  startedAt: ISODateTime;
  completedAt?: ISODateTime;
  ingredientLogs: IngredientLog[];
  stepLogs: StepLog[];
  temperatureHistory: TempSample[];
  retention?: RetentionEstimate;
  /** true once pantry quantities were deducted for this session. */
  pantryDeducted: boolean;
}

// ---------------------------------------------------------------------------
// Nutrient retention
// ---------------------------------------------------------------------------

export type RetentionNutrient =
  | "vitaminC"
  | "vitaminB6"
  | "folate"
  | "vitaminA"
  | "protein"
  | "fat"
  | "iron"
  | "calcium"
  | "fiber";

export interface NutrientRetention {
  nutrient: RetentionNutrient;
  label: string; // "Vitamin C"
  /** 0..1 fraction retained versus raw. */
  retained: number;
  note: string; // "Some loss due to heat. Consider shorter cooking time."
}

export interface RetentionWarning {
  nutrient: RetentionNutrient;
  severity: "info" | "warn" | "critical";
  message: string;
  suggestion: string;
}

export interface RetentionEstimate {
  /** Weighted 0..1 overall score. */
  overall: number;
  nutrients: NutrientRetention[];
  warnings: RetentionWarning[];
  tips: string[];
  computedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Feedback & learning
// ---------------------------------------------------------------------------

export type SpiceFeedback = "too_mild" | "just_right" | "too_hot";
export type QuantityFeedback = "too_little" | "just_right" | "too_much";
export type TextureFeedback = "too_soft" | "perfect" | "too_hard";

export interface MealFeedback {
  id: ID;
  userId: ID;
  sessionId?: ID;
  recipeId: ID;
  rating: 1 | 2 | 3 | 4 | 5;
  taste: 1 | 2 | 3 | 4 | 5;
  spice: SpiceFeedback;
  texture: TextureFeedback;
  quantity: QuantityFeedback;
  notes?: string;
  createdAt: ISODateTime;
}

/**
 * Learned preferences. Scores are centred on 0; positive = liked.
 * Updated incrementally from MealFeedback by the learning engine.
 */
export interface PreferenceModel {
  userId: ID;
  recipeScores: Record<ID, number>;
  ingredientAffinity: Record<ID, number>;
  cuisineAffinity: Record<string, number>;
  tagAffinity: Partial<Record<RecipeTag, number>>;
  /** -1..1, negative means the user wants milder food. */
  spiceAdjust: number;
  /** Multiplier applied to default servings, e.g. 1.15 = wants more. */
  portionAdjust: number;
  feedbackCount: number;
  updatedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Daily progress (derived from cooked meals; persisted for the Home screen)
// ---------------------------------------------------------------------------

export interface DailyIntake {
  date: ISODate;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealsLogged: number;
}

// ---------------------------------------------------------------------------
// AI contracts (request/response shapes for /api/ai/*)
// ---------------------------------------------------------------------------

export interface IdentifyIngredientResult {
  ingredientId?: ID; // matched catalog id if any
  name: string;
  confidence: number; // 0..1
  estimatedGrams?: number;
  alternatives: { ingredientId?: ID; name: string; confidence: number }[];
}

export interface ReceiptScanResult {
  items: {
    ingredientId?: ID;
    name: string;
    quantity: number;
    unit: Unit;
    price?: number;
  }[];
  store?: string;
  total?: number;
}

export interface MealPlanRequest {
  profile: UserProfile;
  weekStart: ISODate;
  pantry: PantryItem[];
  preferences?: PreferenceModel;
  lockedMeals?: PlannedMeal[];
  changes?: ScheduleChange[];
}
