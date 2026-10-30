/**
 * Plan − pantry → grocery list.
 *
 * For every meal still `planned` we sum the grams the recipe needs, subtract
 * pantry stock that will still be good on the day the meal is cooked (FIFO,
 * earliest-expiring lot first), round the shortfall up to a realistic pack size
 * and price it from `costPerKg`.
 */

import type {
  GroceryItem,
  GroceryList,
  ID,
  Ingredient,
  ISODate,
  MealPlan,
  PantryItem,
  Recipe,
  Unit,
} from "@/lib/types";
import { nowIso, uid } from "@/lib/utils";
import {
  DEFAULT_PACK_SIZE_G,
  PACK_SIZE_G,
  PACK_SIZE_OVERRIDE_G,
} from "./constants";
import { freshBuyEveryDays, planFreshVisits } from "./freshness";
import { ceilTo, round } from "./helpers";
import { gramsOf, indexIngredients } from "./nutrition";

/** Pack size (grams / millilitres) a shortfall for this ingredient rounds up to. */
export function packSizeFor(ingredient: Ingredient | undefined): number {
  if (!ingredient) return DEFAULT_PACK_SIZE_G;
  const override = PACK_SIZE_OVERRIDE_G[ingredient.id];
  if (override) return override;
  return PACK_SIZE_G[ingredient.category] ?? DEFAULT_PACK_SIZE_G;
}

interface Requirement {
  date: ISODate;
  grams: number;
}

interface Lot {
  grams: number;
  expiresAt: ISODate;
}

/**
 * Consume `requirements` (in date order) from `lots` (FIFO by expiry) and
 * return what could not be covered, still tagged with the day it is needed.
 *
 * A lot only counts for a requirement whose meal date is on or before the
 * lot's expiry — food that goes off on Tuesday cannot feed Thursday's dinner.
 */
export function uncoveredNeeds(requirements: Requirement[], lots: Lot[]): Requirement[] {
  const stock = lots
    .map((l) => ({ ...l }))
    .sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : a.expiresAt > b.expiresAt ? 1 : 0));
  const needs = [...requirements].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );

  const uncovered: Requirement[] = [];
  for (const need of needs) {
    let left = need.grams;
    for (const lot of stock) {
      if (left <= 0) break;
      if (lot.grams <= 0) continue;
      if (lot.expiresAt < need.date) continue; // already spoiled by then
      const take = Math.min(lot.grams, left);
      lot.grams -= take;
      left -= take;
    }
    if (left > 0) uncovered.push({ date: need.date, grams: left });
  }
  return uncovered;
}

/** Total grams that could not be covered from the pantry. */
export function shortfall(requirements: Requirement[], lots: Lot[]): number {
  return uncoveredNeeds(requirements, lots).reduce((sum, n) => sum + n.grams, 0);
}

export function buildGroceryList(
  plan: MealPlan,
  recipes: Recipe[],
  pantry: PantryItem[],
  ingredients: Ingredient[],
): GroceryList {
  const ts = nowIso();
  const listId = uid();
  const recipeById = new Map<ID, Recipe>(recipes.map((r) => [r.id, r]));
  const catalog = indexIngredients(ingredients);

  // 1. Requirements per ingredient, tagged with the date they are needed.
  const requirements = new Map<ID, Requirement[]>();
  const displayName = new Map<ID, string>();
  const mealById = new Map((plan.meals ?? []).map((m) => [m.id, m]));
  for (const meal of plan.meals ?? []) {
    if (meal.status !== "planned") continue;
    const recipe = recipeById.get(meal.recipeId);
    if (!recipe) continue;

    // A leftover is cooked together with its source meal: the ingredients are
    // needed on the day that dish is cooked, and not at all once it already was.
    let needDate = meal.date;
    if (meal.leftoverOf) {
      const source = mealById.get(meal.leftoverOf);
      if (source) {
        if (source.status !== "planned") continue;
        needDate = source.date;
      }
    }

    const scale = meal.servings / Math.max(1, recipe.servings || 1);
    for (const ri of recipe.ingredients ?? []) {
      const grams = ri.grams * scale;
      if (grams <= 0) continue;
      const list = requirements.get(ri.ingredientId) ?? [];
      list.push({ date: needDate, grams });
      requirements.set(ri.ingredientId, list);
      if (!displayName.has(ri.ingredientId)) displayName.set(ri.ingredientId, ri.name);
    }
  }

  // 2. Pantry lots per ingredient, in grams.
  const lots = new Map<ID, Lot[]>();
  for (const item of pantry ?? []) {
    const grams = gramsOf(item.quantity, item.unit, catalog.get(item.ingredientId));
    if (grams <= 0) continue;
    const list = lots.get(item.ingredientId) ?? [];
    list.push({ grams, expiresAt: item.expiresAt });
    lots.set(item.ingredientId, list);
  }

  // 3. Shortfall → pack sizes → cost.
  const items: GroceryItem[] = [];
  for (const [ingredientId, needs] of requirements) {
    const uncovered = uncoveredNeeds(needs, lots.get(ingredientId) ?? []);
    const missing = uncovered.reduce((sum, n) => sum + n.grams, 0);
    if (missing <= 0.001) continue;

    const ingredient = catalog.get(ingredientId);
    const name = ingredient?.name ?? displayName.get(ingredientId) ?? ingredientId;
    const unit: Unit = ingredient?.defaultUnit ?? "g";
    const usedCost = round((missing / 1000) * (ingredient?.costPerKg ?? 0), 2);

    // Milk, meat, fish and herbs spoil within days: buy them in small trips.
    const everyDays = freshBuyEveryDays(ingredient);
    if (everyDays !== undefined) {
      const visits = planFreshVisits(uncovered, everyDays, ingredient);
      const grams = visits.reduce((sum, v) => sum + v.grams, 0);
      const quantity = visits.reduce((sum, v) => sum + v.quantity, 0);
      items.push({
        id: uid(),
        listId,
        ingredientId,
        name,
        quantity: round(quantity, 2),
        unit,
        grams: round(grams, 2),
        estimatedCost: round((grams / 1000) * (ingredient?.costPerKg ?? 0), 2),
        usedCost,
        fresh: { everyDays, visits },
        purchased: false,
        addedToPantry: false,
      });
      continue;
    }

    let grams: number;
    let quantity: number;
    if (unit === "pcs") {
      const per = ingredient?.gramsPerPiece || 1;
      quantity = Math.max(1, Math.ceil(missing / per));
      grams = quantity * per;
    } else {
      const pack = packSizeFor(ingredient);
      grams = Math.max(pack, ceilTo(missing, pack));
      quantity = grams;
    }

    items.push({
      id: uid(),
      listId,
      ingredientId,
      name,
      quantity: round(quantity, 2),
      unit,
      grams: round(grams, 2),
      estimatedCost: round((grams / 1000) * (ingredient?.costPerKg ?? 0), 2),
      usedCost,
      purchased: false,
      addedToPantry: false,
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name));

  return {
    id: listId,
    userId: plan.userId,
    planId: plan.id,
    items,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * How many purchases are ticked off but not yet in the pantry. An item bought in
 * several trips counts once per ticked trip, an ordinary item counts once.
 */
export function pendingPantryCount(list: GroceryList): number {
  let n = 0;
  for (const item of list.items ?? []) {
    if (item.fresh) {
      n += item.fresh.visits.filter((v) => v.purchased && !v.addedToPantry).length;
    } else if (item.purchased && !item.addedToPantry) {
      n += 1;
    }
  }
  return n;
}

export interface GroceryTotals {
  itemCount: number;
  purchasedCount: number;
  totalGrams: number;
  estimatedCost: number;
  /**
   * Rupees of the list this week's meals actually use up. It is lower than
   * `estimatedCost` because shopping rounds up to whole packs of rice, oil and
   * spices that keep for later weeks.
   */
  usedCost: number;
  purchasedCost: number;
  remainingCost: number;
}

export function groceryTotals(list: GroceryList): GroceryTotals {
  let totalGrams = 0;
  let estimatedCost = 0;
  let usedCost = 0;
  let purchasedCost = 0;
  let purchasedCount = 0;
  for (const item of list.items ?? []) {
    totalGrams += item.grams;
    estimatedCost += item.estimatedCost;
    usedCost += item.usedCost ?? item.estimatedCost;
    if (item.purchased) {
      purchasedCount += 1;
      purchasedCost += item.estimatedCost;
    }
  }
  return {
    itemCount: list.items?.length ?? 0,
    purchasedCount,
    totalGrams: round(totalGrams, 2),
    estimatedCost: round(estimatedCost, 2),
    usedCost: round(usedCost, 2),
    purchasedCost: round(purchasedCost, 2),
    remainingCost: round(estimatedCost - purchasedCost, 2),
  };
}
