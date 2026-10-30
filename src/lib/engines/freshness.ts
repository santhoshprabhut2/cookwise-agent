/**
 * Freshness: use early spoilers first, and re-buy the very perishable.
 *
 * Two ideas, both pure:
 *
 * 1. `freshnessFit` scores a recipe cooked on a given day by how well that day
 *    suits the shelf life of what it uses. Spinach cooked on day 1 is perfect,
 *    spinach cooked on day 6 means it spoiled or had to be re-bought, so the
 *    planner is nudged to put short-lived ingredients early in the week.
 *
 * 2. `freshBuyEveryDays` and `planFreshVisits` mark items that cannot survive a
 *    weekly shop (milk, meat, fish, coriander) and split what the plan needs
 *    into small trips, so the grocery list says "buy daily" instead of
 *    pretending one purchase covers the week.
 */

import type { FreshBuyVisit, ID, Ingredient, ISODate, Recipe } from "@/lib/types";
import {
  FRESH_BUY_EVERY_DAYS,
  FRESH_BUY_MAX_SHELF_DAYS,
  FRESH_ROUND_G,
  PERISHABLE_MAX_SHELF_DAYS,
} from "./constants";
import { ceilTo, daysBetween } from "./helpers";

/**
 * How often an ingredient has to be bought again to stay fresh, in days
 * (1 = daily), or `undefined` when a weekly shop is fine.
 */
export function freshBuyEveryDays(ingredient: Ingredient | undefined): number | undefined {
  if (!ingredient) return undefined;
  const override = FRESH_BUY_EVERY_DAYS[ingredient.id];
  if (override) return override;
  if (ingredient.shelfLifeDays <= FRESH_BUY_MAX_SHELF_DAYS) {
    return Math.max(1, Math.floor(ingredient.shelfLifeDays));
  }
  return undefined;
}

/** Human wording for a re-buy interval: "daily", "every 2 days". */
export function freshBuyLabel(everyDays: number): string {
  return everyDays <= 1 ? "daily" : `every ${everyDays} days`;
}

export interface FreshnessFit {
  /** 0..100. 50 is neutral: the recipe has nothing perishable to order. */
  score: number;
  /** How many perishable ingredients the score is based on. */
  items: number;
}

/**
 * How well cooking `recipe` `daysFromShop` days after the weekly shop suits
 * the shelf life of its perishable ingredients.
 *
 * Each perishable ingredient scores 100 when used straight away, easing to 70
 * on its last good day, then dropping steeply once it is past its shelf life.
 * Shorter-lived ingredients count for more. Ingredients that keep a week or
 * more are ignored, and so are the ones the shopper re-buys fresh anyway.
 */
export function freshnessFit(
  recipe: Recipe,
  daysFromShop: number,
  catalog: ReadonlyMap<ID, Ingredient>,
): FreshnessFit {
  const d = Math.max(0, daysFromShop);
  let weight = 0;
  let total = 0;
  let items = 0;

  for (const ri of recipe.ingredients ?? []) {
    const ingredient = catalog.get(ri.ingredientId);
    if (!ingredient) continue;
    const shelf = ingredient.shelfLifeDays;
    if (shelf > PERISHABLE_MAX_SHELF_DAYS) continue;
    if (freshBuyEveryDays(ingredient) !== undefined) continue;

    const lastGoodDay = Math.max(0, shelf - 1);
    const value =
      d <= lastGoodDay
        ? 100 - 30 * (d / Math.max(1, lastGoodDay))
        : Math.max(0, 40 - 25 * (d - lastGoodDay));

    const w = 1 / shelf;
    weight += w;
    total += w * value;
    items += 1;
  }

  if (weight === 0) return { score: 50, items: 0 };
  return { score: total / weight, items };
}

/** A need for `grams` of an ingredient on `date`. */
export interface DatedNeed {
  date: ISODate;
  grams: number;
}

/** Round a purchase up to a sensible fresh amount (not a whole pack). */
function toVisit(date: ISODate, grams: number, ingredient: Ingredient | undefined): FreshBuyVisit {
  if (ingredient?.defaultUnit === "pcs") {
    const per = ingredient.gramsPerPiece || 1;
    const quantity = Math.max(1, Math.ceil(grams / per));
    return { date, grams: quantity * per, quantity };
  }
  const rounded = Math.max(FRESH_ROUND_G, ceilTo(grams, FRESH_ROUND_G));
  return { date, grams: rounded, quantity: rounded };
}

/**
 * Split what a plan needs into shopping trips. A trip is made on the first day
 * something is needed and covers every need up to `everyDays - 1` days later;
 * the next need after that starts a new trip.
 *
 * Milk needed on Monday and Wednesday with `everyDays = 1` is two trips, not
 * seven. Days with no need produce no trip.
 */
export function planFreshVisits(
  needs: readonly DatedNeed[],
  everyDays: number,
  ingredient?: Ingredient,
): FreshBuyVisit[] {
  const sorted = needs
    .filter((n) => n.grams > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const window = Math.max(1, Math.floor(everyDays));
  const visits: FreshBuyVisit[] = [];

  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i].date;
    let grams = 0;
    while (i < sorted.length && daysBetween(start, sorted[i].date) < window) {
      grams += sorted[i].grams;
      i += 1;
    }
    visits.push(toVisit(start, grams, ingredient));
  }
  return visits;
}
