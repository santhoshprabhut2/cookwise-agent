/**
 * The complete meals: a main dish served with the staple (and sometimes the
 * vegetable side) it is eaten with.
 *
 * They are built, not typed out. `buildCompleteMeals` runs `composeMeal` over
 * these pairings at load time, so every complete meal is exactly its parts:
 * ingredients merged, nutrition and cost summed, and a change to the dal recipe
 * flows into every plate that has dal on it. See docs/SEED_DATA.md for the list.
 *
 * Pure data and a pure function. It never imports the recipe catalog, so there
 * is no import cycle; the catalog passes its core recipes in.
 */

import { composeMeal, stapleTiming } from "@/lib/engines/meals";
import type { MealType, Recipe } from "@/lib/types";

export interface MealPairing {
  id: string;
  name: string;
  emoji: string;
  /** Recipe id of the main dish. */
  main: string;
  /** Recipe ids served with it: staples first, then any side dish. */
  with: string[];
  /** Defaults to lunch and dinner. */
  mealTypes?: MealType[];
}

const RICE = "steamed-rice";
const CHAPATI = "chapati";

export const MEAL_PAIRINGS: MealPairing[] = [
  // With rice
  { id: "rajma-chawal", name: "Rajma Chawal", emoji: "🍛", main: "rajma-masala", with: [RICE] },
  { id: "dal-rice", name: "Dal Tadka with Rice", emoji: "🍲", main: "dal-tadka", with: [RICE] },
  { id: "chana-masala-rice", name: "Chana Masala with Rice", emoji: "🍛", main: "chana-masala", with: [RICE] },
  { id: "soya-curry-rice", name: "Soya Chunk Curry with Rice", emoji: "🍛", main: "soya-chunk-curry", with: [RICE] },
  { id: "chicken-curry-rice", name: "Chicken Curry with Rice", emoji: "🍗", main: "chicken-curry", with: [RICE] },
  { id: "fish-curry-rice", name: "Fish Curry with Rice", emoji: "🐟", main: "fish-curry", with: [RICE] },
  { id: "egg-curry-rice", name: "Tomato Egg Curry with Rice", emoji: "🥚", main: "tomato-egg-curry", with: [RICE] },
  { id: "prawn-masala-rice", name: "Prawn Masala with Rice", emoji: "🍤", main: "prawn-masala", with: [RICE] },
  { id: "tofu-stir-fry-rice", name: "Tofu Stir Fry with Rice", emoji: "🥡", main: "tofu-stir-fry", with: [RICE] },
  { id: "spinach-chicken-rice", name: "Spinach Chicken Stir Fry with Rice", emoji: "🥬", main: "spinach-chicken-stir-fry", with: [RICE] },
  { id: "egg-veg-plate-rice", name: "Steamed Veg and Egg Plate with Rice", emoji: "🥚", main: "steamed-veg-egg-plate", with: [RICE] },

  // With chapati
  { id: "chana-masala-chapati", name: "Chana Masala with Chapati", emoji: "🫓", main: "chana-masala", with: [CHAPATI] },
  { id: "soya-curry-chapati", name: "Soya Chunk Curry with Chapati", emoji: "🫓", main: "soya-chunk-curry", with: [CHAPATI] },
  { id: "chicken-curry-chapati", name: "Chicken Curry with Chapati", emoji: "🫓", main: "chicken-curry", with: [CHAPATI] },
  { id: "egg-curry-chapati", name: "Tomato Egg Curry with Chapati", emoji: "🫓", main: "tomato-egg-curry", with: [CHAPATI] },
  { id: "palak-paneer-chapati", name: "Palak Paneer with Chapati", emoji: "🥬", main: "palak-paneer", with: [CHAPATI] },
  { id: "aloo-gobi-chapati", name: "Aloo Gobi with Chapati", emoji: "🥔", main: "aloo-gobi", with: [CHAPATI] },
  { id: "egg-bhurji-chapati", name: "Egg Bhurji with Chapati", emoji: "🍳", main: "egg-bhurji", with: [CHAPATI], mealTypes: ["breakfast", "dinner"] },
  { id: "paneer-bhurji-chapati", name: "Paneer Bhurji with Chapati", emoji: "🧀", main: "paneer-bhurji", with: [CHAPATI], mealTypes: ["breakfast", "dinner"] },

  // Thalis: a staple and a vegetable side with the dal
  { id: "dal-chapati-thali", name: "Dal Chapati Thali with Cabbage Poriyal", emoji: "🍽️", main: "dal-tadka", with: [CHAPATI, "cabbage-poriyal"] },
  { id: "dal-rice-sabzi-thali", name: "Dal Rice Thali with Aloo Gobi", emoji: "🍽️", main: "dal-tadka", with: [RICE, "aloo-gobi"] },
];

/**
 * Build every complete meal from the core recipes. A pairing that names a recipe
 * the catalog does not have is skipped rather than throwing, so a typo here can
 * never stop the app from loading.
 */
export function buildCompleteMeals(core: readonly Recipe[]): Recipe[] {
  const byId = new Map(core.map((r) => [r.id, r]));
  const meals: Recipe[] = [];
  for (const pairing of MEAL_PAIRINGS) {
    const main = byId.get(pairing.main);
    const parts = pairing.with.map((id) => byId.get(id));
    if (!main || parts.some((p) => p === undefined)) continue;
    meals.push(
      composeMeal(
        main,
        (parts as Recipe[]).map((recipe) => ({ recipe, ...stapleTiming(recipe) })),
        {
          id: pairing.id,
          name: pairing.name,
          emoji: pairing.emoji,
          mealTypes: pairing.mealTypes ?? ["lunch", "dinner"],
        },
      ),
    );
  }
  return meals;
}
