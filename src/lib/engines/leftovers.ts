/**
 * Leftover links: "this meal re-serves a dish cooked for another meal".
 *
 * Kept apart from the planner so the data stores can keep links honest after
 * every edit without depending on the planning engine.
 */

import type { MealType, PlannedMeal } from "@/lib/types";

const MEAL_ORDER: Record<MealType, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
  snack: 3,
};

/** True when `a` happens strictly before `b` in the week. */
function isBefore(a: PlannedMeal, b: PlannedMeal): boolean {
  if (a.date !== b.date) return a.date < b.date;
  return MEAL_ORDER[a.mealType] < MEAL_ORDER[b.mealType];
}

/**
 * Drop any `leftoverOf` link that no longer makes sense: the source meal is
 * gone, was skipped, changed recipe, or does not come before the leftover. The
 * meal then simply becomes a normal planned meal that is cooked fresh.
 *
 * Returns the same array when nothing needed fixing.
 */
export function sanitizeLeftovers(meals: PlannedMeal[]): PlannedMeal[] {
  const byId = new Map(meals.map((m) => [m.id, m]));
  let changed = false;
  const out = meals.map((m) => {
    if (!m.leftoverOf) return m;
    const source = byId.get(m.leftoverOf);
    const valid =
      source !== undefined &&
      source.id !== m.id &&
      !source.leftoverOf &&
      source.recipeId === m.recipeId &&
      source.status !== "skipped" &&
      source.status !== "eating_out" &&
      isBefore(source, m);
    if (valid) return m;
    changed = true;
    const rest = { ...m };
    delete rest.leftoverOf;
    return rest;
  });
  return changed ? out : meals;
}
