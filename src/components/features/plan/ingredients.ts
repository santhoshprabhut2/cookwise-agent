import type { Recipe } from "@/lib/types";

/** One line of a dish's shopping-and-weighing list. */
export interface IngredientRow {
  ingredientId: string;
  name: string;
  /** What to weigh or count, e.g. "150 g", "3 pcs · 150 g", "7.5 ml". */
  amount: string;
  grams: number;
  optional?: boolean;
}

/** Whole grams from 10 up, one decimal below, so 0.5 g of pepper is not lost. */
function roundGrams(g: number): number {
  return g < 10 ? Math.round(g * 10) / 10 : Math.round(g);
}

/** Counted items come in halves at the smallest. */
function roundCount(n: number): number {
  return Math.max(0.5, Math.round(n * 2) / 2);
}

/**
 * The ingredients of `recipe` scaled to `servings`, each with the amount to
 * weigh out. Recipe quantities are stated for `recipe.servings`.
 */
export function ingredientRows(recipe: Recipe, servings: number): IngredientRow[] {
  const scale = servings / Math.max(1, recipe.servings || 1);
  return (recipe.ingredients ?? []).map((ri) => {
    const grams = roundGrams(ri.grams * scale);
    let amount: string;
    if (ri.unit === "pcs") {
      const count = roundCount(ri.quantity * scale);
      amount = `${count} ${count === 1 ? "pc" : "pcs"} · ${grams} g`;
    } else if (ri.unit === "ml") {
      amount = `${roundGrams(ri.quantity * scale)} ml`;
    } else {
      amount = `${grams} g`;
    }
    return {
      ingredientId: ri.ingredientId,
      name: ri.name,
      amount,
      grams,
      optional: ri.optional,
    };
  });
}

/** Combined weight of every row, in grams. */
export function totalGrams(rows: readonly IngredientRow[]): number {
  return Math.round(rows.reduce((sum, r) => sum + r.grams, 0));
}
