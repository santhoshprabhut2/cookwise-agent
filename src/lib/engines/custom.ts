/**
 * Custom foods: turning what a user types (a name, a list of ingredients with
 * weights, how long it takes) into a proper `Recipe`.
 *
 * Nutrition and cost come from the ingredient catalog, so a custom dish is as
 * trustworthy as a built-in one and works everywhere a recipe does: the plan,
 * the grocery list, cooking mode and the retention model. Pure and UI-free.
 */

import type {
  CookingMethod,
  DietType,
  ID,
  Ingredient,
  MealType,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  RecipeTag,
} from "@/lib/types";
import { uid } from "@/lib/utils";
import { composeMeal, stapleTiming } from "./meals";
import { indexIngredients, nutritionFromGrams } from "./nutrition";

/** A whole plate, a dish that needs rice or chapati, or a staple or side. */
export type CustomKind = "meal" | "dish" | "side";

export interface CustomFoodInput {
  /** Present when editing an existing food. */
  id?: ID;
  name: string;
  emoji: string;
  kind: CustomKind;
  mealTypes: MealType[];
  servings: number;
  prepMin: number;
  cookMin: number;
  method: CookingMethod;
  ingredients: { ingredientId: ID; grams: number }[];
  /** Free text: how the user makes it. */
  howTo?: string;
  /** Staples or sides to build into one plate. Only used for a `dish`. */
  serveWith?: Recipe[];
  userId: ID;
}

/** Pan or pot temperature window for each method, inside what the retention model expects. */
export const METHOD_TEMP_C: Partial<Record<CookingMethod, [number, number]>> = {
  boil: [95, 100],
  steam: [95, 100],
  simmer: [90, 100],
  saute: [120, 150],
  stir_fry: [160, 200],
  shallow_fry: [150, 180],
  deep_fry: [170, 190],
  bake: [170, 200],
  roast: [170, 210],
  grill: [190, 230],
  pressure_cook: [110, 120],
  microwave: [90, 110],
};

const MEAT = new Set(["chicken"]);
const SEAFOOD = new Set(["fish", "prawns"]);
const EGG = new Set(["egg"]);
const ANIMAL = new Set(["milk", "curd", "paneer", "ghee", "butter", "cheese", "honey"]);

/**
 * The diets a dish suits, widest first, by what is in it. Meat means
 * non-vegetarian only, fish adds pescatarian, egg adds eggetarian, and dairy or
 * honey rules out vegan. Matches the convention of the built-in recipes.
 */
export function dietsFor(ingredientIds: readonly ID[]): DietType[] {
  const has = (set: Set<string>) => ingredientIds.some((id) => set.has(id));
  if (has(MEAT)) return ["non_vegetarian"];
  if (has(SEAFOOD)) return ["pescatarian", "non_vegetarian"];
  if (has(EGG)) return ["eggetarian", "non_vegetarian"];
  if (has(ANIMAL)) return ["vegetarian", "eggetarian", "pescatarian", "non_vegetarian"];
  return ["vegetarian", "vegan", "eggetarian", "pescatarian", "non_vegetarian"];
}

/** What is wrong with the input, in the user's words. Empty when it can be saved. */
export function validateCustomFood(input: CustomFoodInput): string[] {
  const problems: string[] = [];
  if (!input.name.trim()) problems.push("Give the food a name.");
  if (input.mealTypes.length === 0) problems.push("Pick at least one meal it suits.");
  if (!(input.servings >= 1)) problems.push("It must serve at least one person.");
  const real = input.ingredients.filter((i) => i.grams > 0);
  if (real.length === 0) problems.push("Add at least one ingredient with a weight.");
  return problems;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function ingredientLine(ingredient: Ingredient, grams: number): RecipeIngredient {
  const unit = ingredient.defaultUnit;
  const quantity =
    unit === "pcs" ? round1(grams / Math.max(1, ingredient.gramsPerPiece ?? 50)) : round1(grams);
  return { ingredientId: ingredient.id, name: ingredient.name, quantity, unit, grams: round1(grams) };
}

const SERVE_STEP = { title: "Serve", instruction: "Plate it up and serve while it is fresh.", durationSec: 60 };

/**
 * Weigh out, cook, serve: the three steps a custom food gets. A dish that will
 * be joined to a staple leaves "Serve" off, since it belongs after the staple.
 */
function customSteps(
  id: ID,
  input: CustomFoodInput,
  lines: readonly RecipeIngredient[],
  withServe: boolean,
): RecipeStep[] {
  const steps: RecipeStep[] = [];
  const push = (step: Omit<RecipeStep, "id" | "order">) =>
    steps.push({ ...step, id: `${id}-s${steps.length + 1}`, order: steps.length + 1 });

  push({
    title: "Weigh and prepare",
    instruction: "Weigh out every ingredient and wash, peel or chop it as needed.",
    durationSec: Math.max(60, input.prepMin * 60),
    addIngredients: lines.map((l) => ({ ingredientId: l.ingredientId, grams: l.grams })),
  });

  const how = input.howTo?.trim();
  const window = METHOD_TEMP_C[input.method];
  if (window && input.cookMin > 0) {
    push({
      title: "Cook",
      instruction: how || "Cook everything together until it is done.",
      method: input.method,
      durationSec: Math.max(60, input.cookMin * 60),
      targetTempC: { min: window[0], max: window[1] },
      stateCue: "cooked through and done to your liking",
    });
  } else {
    push({
      title: "Mix",
      instruction: how || "Combine everything and mix well.",
      durationSec: 120,
    });
  }

  if (withServe) push(SERVE_STEP);
  return steps;
}

/**
 * Build a recipe from what the user entered. Ingredients that are not in the
 * catalog are ignored. A `dish` with `serveWith` staples becomes one complete
 * meal, merged exactly like the built-in ones.
 */
export function buildCustomRecipe(
  input: CustomFoodInput,
  catalog: readonly Ingredient[],
): Recipe {
  const index = indexIngredients(catalog);
  const id = input.id ?? `custom-${uid()}`;
  const servings = Math.max(1, Math.round(input.servings));

  const lines: RecipeIngredient[] = [];
  const grams = new Map<ID, number>();
  for (const { ingredientId, grams: g } of input.ingredients) {
    const ingredient = index.get(ingredientId);
    if (!ingredient || !(g > 0)) continue;
    grams.set(ingredientId, (grams.get(ingredientId) ?? 0) + g);
  }
  for (const [ingredientId, g] of grams) lines.push(ingredientLine(index.get(ingredientId)!, g));

  const nutrition = nutritionFromGrams(grams, index, servings);
  let costTotal = 0;
  for (const [ingredientId, g] of grams) costTotal += (g / 1000) * (index.get(ingredientId)?.costPerKg ?? 0);
  const costPerServing = Math.max(1, Math.round(costTotal / servings));

  const parts = input.kind === "dish" ? (input.serveWith ?? []) : [];
  const minutes = input.prepMin + input.cookMin;
  const tags: RecipeTag[] = [];
  if (input.kind === "meal") tags.push("complete_meal");
  if (input.kind === "side") tags.push("staple");
  if (nutrition.proteinG >= 20) tags.push("high_protein");
  if (minutes <= 20) tags.push("quick");
  if (costPerServing <= 25) tags.push("budget");

  const base: Recipe = {
    id,
    name: input.name.trim(),
    description: input.howTo?.trim() ? input.howTo.trim().split("\n")[0].slice(0, 140) : "A food you added.",
    cuisine: "home",
    mealTypes: input.mealTypes,
    tags,
    emoji: input.emoji || "🍽️",
    servings,
    prepTimeMin: Math.max(0, Math.round(input.prepMin)),
    cookTimeMin: Math.max(0, Math.round(input.cookMin)),
    difficulty: "easy",
    spiceLevel: 2,
    diets: dietsFor([...grams.keys()]),
    equipment: ["stove"],
    primaryMethod: input.method,
    ingredients: lines,
    steps: customSteps(id, input, lines, parts.length === 0),
    nutritionPerServing: nutrition,
    costPerServing,
    isPublic: false,
    createdBy: input.userId,
  };

  if (parts.length === 0) return base;

  const plate = composeMeal(
    base,
    parts.map((recipe) => ({ recipe, ...stapleTiming(recipe) })),
    {
      id,
      name: base.name,
      emoji: base.emoji,
      mealTypes: input.mealTypes,
      isPublic: false,
      createdBy: input.userId,
    },
  );
  const order = plate.steps.length + 1;
  return { ...plate, steps: [...plate.steps, { ...SERVE_STEP, id: `${id}-s${order}`, order }] };
}

/** Read an existing custom recipe back into form values, for editing. */
export function customFoodFromRecipe(recipe: Recipe, userId: ID): CustomFoodInput {
  const kind: CustomKind = recipe.tags.includes("staple")
    ? "side"
    : recipe.tags.includes("complete_meal")
      ? "meal"
      : "dish";
  const cookStep = recipe.steps.find((s) => s.method);
  const how = (cookStep ?? recipe.steps[1])?.instruction ?? "";
  const generic = how.startsWith("Cook everything together") || how.startsWith("Combine everything");
  return {
    id: recipe.id,
    name: recipe.name,
    emoji: recipe.emoji,
    kind,
    mealTypes: recipe.mealTypes,
    servings: recipe.servings,
    prepMin: recipe.prepTimeMin,
    cookMin: recipe.cookTimeMin,
    method: recipe.primaryMethod,
    ingredients: recipe.ingredients.map((i) => ({ ingredientId: i.ingredientId, grams: i.grams })),
    howTo: generic ? "" : how,
    userId,
  };
}
