/**
 * Complete meals.
 *
 * A curry is a dish, not a lunch: people eat it with rice or chapati. This
 * module says which recipes are already a whole plate, keeps staples such as
 * rice and chapati out of the automatic plan, and `composeMeal` joins a main
 * dish and its staple into one ordinary recipe. Because the result is a plain
 * `Recipe`, the planner, grocery list, cooking mode and retention model all
 * work with it unchanged.
 */

import type {
  Difficulty,
  Equipment,
  ID,
  MealType,
  NutrientKey,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  RecipeTag,
  UserProfile,
} from "@/lib/types";
import { COMPLETE_MEAL_MIN_CARBS_G } from "./constants";
import { isRecipeAllowed } from "./filters";
import { addNutrition, toNutritionPerServing } from "./nutrition";

/** Rice, chapati and the like: eaten with a main dish, never planned alone. */
export function isStaple(recipe: Recipe): boolean {
  return (recipe.tags ?? []).includes("staple");
}

/**
 * Whether a recipe is a whole plate. Tagged `complete_meal`, or starchy enough
 * (biryani, khichdi, curd rice) that its staple is already in the dish.
 */
export function isCompleteMeal(recipe: Recipe): boolean {
  if (isStaple(recipe)) return false;
  if ((recipe.tags ?? []).includes("complete_meal")) return true;
  return (recipe.nutritionPerServing?.carbsG ?? 0) >= COMPLETE_MEAL_MIN_CARBS_G;
}

/** Allowed for this profile and fit to be chosen on its own. */
export function isPlannable(recipe: Recipe, profile: UserProfile): boolean {
  return !isStaple(recipe) && isRecipeAllowed(recipe, profile);
}

/**
 * How a staple is cooked next to a main dish. Rice simmers unattended while the
 * curry is made, so it starts first and adds no time. Chapati needs hands and a
 * hot tawa, so it comes last and its time is added.
 */
export interface StapleTiming {
  first: boolean;
  alongside: boolean;
}

const PASSIVE_METHODS = new Set(["boil", "simmer", "steam", "pressure_cook"]);

export function stapleTiming(staple: Recipe): StapleTiming {
  const passive = PASSIVE_METHODS.has(staple.primaryMethod);
  return { first: passive, alongside: passive };
}

/** Round to a decimal place for small amounts, to whole numbers from 10 up. */
function neat(n: number): number {
  return n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Multiply every weight or volume written in a sentence ("200 g", "500 ml") by
 * `factor`. Times, counts and lengths are left alone, so a rice recipe written
 * for two can be read correctly inside a meal for four.
 */
export function scaleAmounts(text: string, factor: number): string {
  if (factor === 1) return text;
  return text.replace(/(\d+(?:\.\d+)?)(\s*)(g|ml)\b/g, (_m, n: string, space: string, unit: string) => {
    return `${neat(Number(n) * factor)}${space}${unit}`;
  });
}

export interface MealPart {
  recipe: Recipe;
  /** Cook this part's steps before the main dish steps (rice goes on first). */
  first?: boolean;
  /** This part cooks while the rest is made, so its time is not added. */
  alongside?: boolean;
}

export interface ComposeOptions {
  id: ID;
  name: string;
  description?: string;
  emoji?: string;
  /** Defaults to the meal types of the main dish. */
  mealTypes?: MealType[];
  isPublic?: boolean;
  createdBy?: ID;
}

const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

/** Add one ingredient to `into`, summing with an existing line and keeping units consistent. */
function mergeIngredient(into: RecipeIngredient[], ri: RecipeIngredient, factor: number): void {
  const grams = round1(ri.grams * factor);
  const existing = into.find((x) => x.ingredientId === ri.ingredientId);
  if (!existing) {
    into.push({ ...ri, quantity: Math.round(ri.quantity * factor * 100) / 100, grams });
    return;
  }
  if (existing.unit === ri.unit) {
    existing.quantity = Math.round((existing.quantity + ri.quantity * factor) * 100) / 100;
  } else {
    // Same ingredient in two units: keep the first line's ratio of amount to grams.
    const perGram = existing.grams > 0 ? existing.quantity / existing.grams : 1;
    existing.quantity = Math.round((existing.quantity + grams * perGram) * 100) / 100;
  }
  existing.grams = round1(existing.grams + grams);
}

/**
 * Join a main dish and the parts served with it (rice, chapati, a vegetable
 * side) into one recipe for the number of servings of the main dish.
 *
 * Each part is scaled so there is one serving of it per serving of the main.
 * Ingredients are merged, steps are renumbered and the amounts a part writes in
 * its instructions are rescaled. Nutrition and cost per serving are the sums of
 * the parts. A part that cooks `alongside` adds no time.
 */
export function composeMeal(main: Recipe, parts: readonly MealPart[], opts: ComposeOptions): Recipe {
  const servings = Math.max(1, main.servings || 1);
  const scaled = parts.map((p) => ({ ...p, k: servings / Math.max(1, p.recipe.servings || 1) }));

  const ingredients: RecipeIngredient[] = [];
  for (const ri of main.ingredients) mergeIngredient(ingredients, ri, 1);
  for (const p of scaled) for (const ri of p.recipe.ingredients) mergeIngredient(ingredients, ri, p.k);

  // Steps: parts that start first, then the main dish, then the rest.
  const sources = [
    ...scaled.filter((p) => p.first).map((p) => ({ recipe: p.recipe, k: p.k, prefix: p.recipe.name })),
    { recipe: main, k: 1, prefix: "" },
    ...scaled.filter((p) => !p.first).map((p) => ({ recipe: p.recipe, k: p.k, prefix: p.recipe.name })),
  ];
  const steps: RecipeStep[] = [];
  for (const src of sources) {
    for (const step of src.recipe.steps) {
      const order = steps.length + 1;
      const next: RecipeStep = {
        ...step,
        id: `${opts.id}-s${order}`,
        order,
        title: src.prefix ? `${src.prefix}: ${step.title}` : step.title,
        instruction: scaleAmounts(step.instruction, src.k),
      };
      if (step.tip) next.tip = scaleAmounts(step.tip, src.k);
      if (step.addIngredients) {
        next.addIngredients = step.addIngredients.map((a) => ({ ...a, grams: round1(a.grams * src.k) }));
      }
      steps.push(next);
    }
  }

  const prepTimeMin = main.prepTimeMin + scaled.reduce((sum, p) => sum + p.recipe.prepTimeMin, 0);
  const sequentialCook =
    main.cookTimeMin +
    scaled.filter((p) => !p.alongside).reduce((sum, p) => sum + p.recipe.cookTimeMin, 0);
  const alongsideCook = Math.max(0, ...scaled.filter((p) => p.alongside).map((p) => p.recipe.cookTimeMin));
  const cookTimeMin = Math.max(sequentialCook, alongsideCook);

  const nutrition: Partial<Record<NutrientKey, number>> = {};
  addNutrition(nutrition, main.nutritionPerServing);
  for (const p of parts) addNutrition(nutrition, p.recipe.nutritionPerServing);

  const everyRecipe = [main, ...parts.map((p) => p.recipe)];
  const tags = new Set<RecipeTag>();
  for (const r of everyRecipe) for (const t of r.tags) tags.add(t);
  tags.delete("staple");
  tags.delete("low_cal"); // a staple makes this untrue
  if (prepTimeMin + cookTimeMin > 20) tags.delete("quick");

  const equipment = new Set<Equipment>();
  for (const r of everyRecipe) for (const e of r.equipment) equipment.add(e);

  const difficulty = everyRecipe.reduce<Difficulty>(
    (hardest, r) => (DIFFICULTY_RANK[r.difficulty] > DIFFICULTY_RANK[hardest] ? r.difficulty : hardest),
    "easy",
  );

  const names = parts.map((p) => p.recipe.name).join(" and ");
  const meal: Recipe = {
    id: opts.id,
    name: opts.name,
    description: opts.description ?? (names ? `${main.name} served with ${names}.` : main.description),
    cuisine: main.cuisine,
    mealTypes: opts.mealTypes ?? main.mealTypes,
    tags: ["complete_meal" as RecipeTag, ...tags].filter((t, i, all) => all.indexOf(t) === i),
    emoji: opts.emoji ?? main.emoji,
    servings,
    prepTimeMin,
    cookTimeMin,
    difficulty,
    spiceLevel: main.spiceLevel,
    diets: main.diets.filter((d) => parts.every((p) => p.recipe.diets.includes(d))),
    equipment: [...equipment],
    primaryMethod: main.primaryMethod,
    ingredients,
    steps,
    nutritionPerServing: toNutritionPerServing(nutrition, 1),
    costPerServing: Math.max(1, Math.round(everyRecipe.reduce((sum, r) => sum + (r.costPerServing ?? 0), 0))),
    isPublic: opts.isPublic ?? true,
  };
  if (opts.createdBy) meal.createdBy = opts.createdBy;
  return meal;
}
