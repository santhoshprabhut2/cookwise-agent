/**
 * Hand-written `Database` type for the Cookwise Postgres schema.
 *
 * It mirrors `supabase/migrations/0001_init.sql` one-to-one: top-level columns
 * are snake_case, nested structures are `jsonb` typed with the camelCase shapes
 * from `src/lib/types.ts`. Keep the two in sync — or regenerate with
 * `supabase gen types typescript --linked > src/lib/supabase/types.ts`.
 */

import type {
  CookSessionStatus,
  DietType,
  Difficulty,
  Equipment,
  Goal,
  GroceryItem,
  IngredientCategory,
  IngredientLog,
  MealType,
  NutritionPer100,
  NutritionPerServing,
  PantrySource,
  PlannedMeal,
  Priority,
  QuantityFeedback,
  RecipeIngredient,
  RecipeStep,
  RecipeTag,
  RetentionEstimate,
  ScheduleChangeType,
  SkillLevel,
  SpiceFeedback,
  StepLog,
  StorageLocation,
  TempSample,
  TextureFeedback,
  TimeAvailability,
  TimeSchedule,
  Unit,
} from "@/lib/types";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Gender = "male" | "female" | "other" | "prefer_not_to_say";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export type ProfileRow = {
  id: string;
  name: string;
  age: number | null;
  city: string | null;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  avatar_url: string | null;
  diet: DietType;
  allergies: string[];
  restrictions: string[];
  goal: Goal;
  daily_calorie_target: number;
  protein_target_g: number;
  equipment: Equipment[];
  favorite_foods: string[];
  disliked_ingredients: string[];
  cuisines: string[];
  spice_level: number;
  budget_monthly: number;
  currency: string;
  skill: SkillLevel;
  time_availability: TimeAvailability;
  time_schedule: TimeSchedule | null;
  priorities: Priority[];
  servings_default: number;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
};

export type IngredientRow = {
  id: string;
  name: string;
  category: IngredientCategory;
  emoji: string;
  image_url: string | null;
  default_unit: Unit;
  grams_per_piece: number | null;
  shelf_life_days: number;
  storage: StorageLocation;
  cost_per_kg: number;
  nutrition: NutritionPer100;
  aliases: string[];
  created_at: string;
  updated_at: string;
};

export type RecipeRow = {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  meal_types: MealType[];
  tags: RecipeTag[];
  emoji: string;
  image_url: string | null;
  servings: number;
  prep_time_min: number;
  cook_time_min: number;
  difficulty: Difficulty;
  spice_level: number;
  diets: DietType[];
  equipment: Equipment[];
  primary_method: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  nutrition_per_serving: NutritionPerServing;
  cost_per_serving: number;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PantryItemRow = {
  id: string;
  user_id: string;
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: Unit;
  added_at: string;
  expires_at: string | null;
  source: PantrySource;
  updated_at: string;
};

export type MealPlanRow = {
  id: string;
  user_id: string;
  week_start: string;
  meals: PlannedMeal[];
  generated_by: "heuristic" | "gemini";
  created_at: string;
  updated_at: string;
};

export type GroceryListRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  items: GroceryItem[];
  created_at: string;
  updated_at: string;
};

export type ScheduleChangeRow = {
  id: string;
  user_id: string;
  type: ScheduleChangeType;
  date: string;
  meal_type: MealType | null;
  available_minutes: number | null;
  guest_count: number | null;
  mood_tags: string[];
  note: string | null;
  created_at: string;
};

export type CookSessionRow = {
  id: string;
  user_id: string;
  recipe_id: string;
  planned_meal_id: string | null;
  servings: number;
  status: CookSessionStatus;
  started_at: string;
  completed_at: string | null;
  ingredient_logs: IngredientLog[];
  step_logs: StepLog[];
  temperature_history: TempSample[];
  retention: RetentionEstimate | null;
  pantry_deducted: boolean;
  updated_at: string;
};

export type MealFeedbackRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  recipe_id: string;
  rating: number;
  taste: number;
  spice: SpiceFeedback;
  texture: TextureFeedback;
  quantity: QuantityFeedback;
  notes: string | null;
  created_at: string;
};

export type PreferenceModelRow = {
  user_id: string;
  recipe_scores: Record<string, number>;
  ingredient_affinity: Record<string, number>;
  cuisine_affinity: Record<string, number>;
  tag_affinity: Partial<Record<RecipeTag, number>>;
  spice_adjust: number;
  portion_adjust: number;
  feedback_count: number;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Insert / Update helpers
//
// Insert: every column with a database default is optional.
// Update: everything is optional.
// ---------------------------------------------------------------------------

/** Flattens an intersection into a single object type (keeps `?` modifiers). */
type Flatten<T> = { [K in keyof T]: T[K] };

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Flatten<Pick<Row, Required> & Partial<Omit<Row, Required>>>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id">;
      ingredients: Table<IngredientRow, "id" | "name" | "category">;
      recipes: Table<RecipeRow, "id" | "name">;
      pantry_items: Table<PantryItemRow, "user_id" | "ingredient_id" | "name">;
      meal_plans: Table<MealPlanRow, "user_id" | "week_start">;
      grocery_lists: Table<GroceryListRow, "user_id">;
      schedule_changes: Table<ScheduleChangeRow, "user_id" | "type" | "date">;
      cook_sessions: Table<CookSessionRow, "user_id" | "recipe_id">;
      meal_feedback: Table<
        MealFeedbackRow,
        "user_id" | "recipe_id" | "rating" | "taste" | "spice" | "texture" | "quantity"
      >;
      preference_models: Table<PreferenceModelRow, "user_id">;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

/** Convenience aliases so callers do not have to spell out the indexed access. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
