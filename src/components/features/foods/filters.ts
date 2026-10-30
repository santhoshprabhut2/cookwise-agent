/**
 * Pure helpers behind the "Complete meals" and "My foods" screens: which
 * filter chips exist, what each one matches, and how a food is described.
 */

import { isCompleteMeal, isStaple } from "@/lib/engines/meals";
import type { ID, Ingredient, MealPlan, Recipe } from "@/lib/types";

export type PlateFilterKey =
  | "all"
  | "rice"
  | "chapati"
  | "veg"
  | "egg"
  | "meat_fish"
  | "quick";

const RICE = ["rice", "basmati-rice"];
const FLOUR = ["wheat-flour"];
const EGG = ["egg"];
const MEAT_FISH = ["chicken", "fish", "prawns"];

const QUICK_MAX_MIN = 30;

function uses(recipe: Recipe, ids: readonly ID[]): boolean {
  return recipe.ingredients.some((i) => ids.includes(i.ingredientId));
}

export const PLATE_FILTERS: {
  key: PlateFilterKey;
  label: string;
  test: (recipe: Recipe) => boolean;
}[] = [
  { key: "all", label: "All", test: () => true },
  { key: "rice", label: "With rice", test: (r) => uses(r, RICE) },
  { key: "chapati", label: "With chapati", test: (r) => uses(r, FLOUR) },
  { key: "veg", label: "Vegetarian", test: (r) => r.diets.includes("vegetarian") },
  { key: "egg", label: "Egg", test: (r) => uses(r, EGG) },
  { key: "meat_fish", label: "Chicken and fish", test: (r) => uses(r, MEAT_FISH) },
  {
    key: "quick",
    label: `Under ${QUICK_MAX_MIN} min`,
    test: (r) => r.prepTimeMin + r.cookTimeMin <= QUICK_MAX_MIN,
  },
];

/** Whole plates for lunch or dinner, narrowed by one chip. */
export function filterPlates(recipes: readonly Recipe[], key: PlateFilterKey): Recipe[] {
  const chip = PLATE_FILTERS.find((f) => f.key === key) ?? PLATE_FILTERS[0];
  return recipes.filter(
    (r) =>
      isCompleteMeal(r) &&
      (r.mealTypes.includes("lunch") || r.mealTypes.includes("dinner")) &&
      chip.test(r),
  );
}

/** What a user-added food is, in the user's words. */
export function foodKindLabel(recipe: Recipe): string {
  if (isStaple(recipe)) return "Side or staple";
  return isCompleteMeal(recipe) ? "Complete meal" : "Needs rice or chapati";
}

/** Planned meals that are still ahead (not cooked, skipped or eaten out) and use this food. */
export function upcomingUses(plans: readonly MealPlan[], recipeId: ID): string[] {
  const ids: string[] = [];
  for (const plan of plans) {
    for (const meal of plan.meals) {
      if (meal.recipeId === recipeId && meal.status === "planned") ids.push(meal.id);
    }
  }
  return ids;
}

/** A sensible first weight when an ingredient is added to a food. */
export function defaultGrams(ingredient: Ingredient): number {
  if (ingredient.defaultUnit === "pcs") return ingredient.gramsPerPiece ?? 50;
  if (ingredient.category === "spices") return 3;
  if (ingredient.category === "oils") return 10;
  return 100;
}
