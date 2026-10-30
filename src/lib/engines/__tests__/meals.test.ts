import { describe, expect, it } from "vitest";
import type { Recipe } from "@/lib/types";
import {
  composeMeal,
  isCompleteMeal,
  isPlannable,
  isStaple,
  scaleAmounts,
  stapleTiming,
} from "../meals";
import { makeProfile, makeRecipe, ri } from "./fixtures";

const step = (id: string, title: string, over: Partial<Recipe["steps"][number]> = {}) => ({
  id, order: 1, title, instruction: `Do ${title}.`, ...over,
});

/** A curry for four. */
const curry = makeRecipe({
  id: "curry", name: "Dal", servings: 4, prepTimeMin: 10, cookTimeMin: 20, spiceLevel: 3,
  tags: ["budget", "low_cal", "quick", "batch_friendly"], difficulty: "easy",
  diets: ["vegetarian", "vegan"], equipment: ["stove", "pressure_cooker"],
  ingredients: [ri("dal", 200), ri("salt", 4)],
  steps: [
    step("c1", "Boil", { order: 1, method: "boil", durationSec: 600, addIngredients: [{ ingredientId: "dal", grams: 200 }] }),
    step("c2", "Season", { order: 2, addIngredients: [{ ingredientId: "salt", grams: 4 }] }),
  ],
  nutritionPerServing: { kcal: 250, proteinG: 12, carbsG: 38, fatG: 6, fiberG: 6, ironMg: 2 },
  costPerServing: 17,
});

/** Rice for two, cooked passively. */
const rice = makeRecipe({
  id: "rice", name: "Steamed Rice", servings: 2, prepTimeMin: 3, cookTimeMin: 25,
  tags: ["staple", "budget"], difficulty: "easy", primaryMethod: "simmer",
  diets: ["vegetarian", "vegan", "eggetarian"], equipment: ["stove"],
  ingredients: [ri("rice", 200), ri("salt", 2)],
  steps: [
    step("r1", "Rinse", { order: 1, instruction: "Rinse 200 g of rice in 500 ml of water.", tip: "Use 2 g of salt.", addIngredients: [{ ingredientId: "rice", grams: 200 }] }),
    step("r2", "Cook", { order: 2, method: "simmer", durationSec: 900, addIngredients: [{ ingredientId: "salt", grams: 2 }] }),
  ],
  nutritionPerServing: { kcal: 345, proteinG: 7, carbsG: 78, fatG: 1, fiberG: 1 },
  costPerServing: 8,
});

/** Chapati for two, which needs hands. */
const chapati = makeRecipe({
  id: "chapati", name: "Chapati", servings: 2, prepTimeMin: 20, cookTimeMin: 8,
  tags: ["staple", "high_fiber"], difficulty: "medium", primaryMethod: "roast",
  diets: ["vegetarian", "vegan"], equipment: ["stove", "tawa"],
  ingredients: [ri("flour", 180), ri("salt", 2)],
  steps: [
    step("p1", "Knead", {
      order: 1,
      addIngredients: [{ ingredientId: "flour", grams: 180 }, { ingredientId: "salt", grams: 2 }],
    }),
  ],
  nutritionPerServing: { kcal: 347, proteinG: 9, carbsG: 62, fatG: 6, fiberG: 9 },
  costPerServing: 6,
});

describe("what counts as a complete meal", () => {
  it("is a recipe tagged complete_meal", () => {
    expect(isCompleteMeal(makeRecipe({ id: "x", tags: ["complete_meal"], nutritionPerServing: { kcal: 300, proteinG: 10, carbsG: 20, fatG: 5, fiberG: 2 } }))).toBe(true);
  });

  it("is a starchy dish that already has its staple in it", () => {
    expect(isCompleteMeal(makeRecipe({ id: "biryani", nutritionPerServing: { kcal: 620, proteinG: 36, carbsG: 70, fatG: 20, fiberG: 3 } }))).toBe(true);
  });

  it("is not a curry or a side", () => {
    expect(isCompleteMeal(curry)).toBe(false);
  });

  it("is never a staple, however many carbs it has", () => {
    expect(isCompleteMeal(rice)).toBe(false);
    expect(isStaple(rice)).toBe(true);
    expect(isStaple(curry)).toBe(false);
  });

  it("keeps staples out of automatic picks but not other dishes", () => {
    const profile = makeProfile({ diet: "vegetarian" });
    expect(isPlannable(rice, profile)).toBe(false);
    expect(isPlannable(curry, profile)).toBe(true);
  });

  it("starts rice first and alongside, and chapati last and added on", () => {
    expect(stapleTiming(rice)).toEqual({ first: true, alongside: true });
    expect(stapleTiming(chapati)).toEqual({ first: false, alongside: false });
  });
});

describe("scaleAmounts", () => {
  it("scales weights and volumes", () => {
    expect(scaleAmounts("Rinse 200 g of rice in 500 ml of water.", 2)).toBe("Rinse 400 g of rice in 1000 ml of water.");
  });

  it("leaves times, counts and lengths alone", () => {
    expect(scaleAmounts("Cook 15 minutes, 3 per serving, 15 cm wide.", 2)).toBe("Cook 15 minutes, 3 per serving, 15 cm wide.");
  });

  it("keeps a decimal for small amounts and returns the text unchanged at 1", () => {
    expect(scaleAmounts("Add 2 g of salt.", 1.5)).toBe("Add 3 g of salt.");
    expect(scaleAmounts("Add 1 g of salt.", 1.5)).toBe("Add 1.5 g of salt.");
    expect(scaleAmounts("Add 2 g of salt.", 1)).toBe("Add 2 g of salt.");
  });
});

describe("composeMeal", () => {
  const withRice = composeMeal(curry, [{ recipe: rice, ...stapleTiming(rice) }], {
    id: "dal-rice", name: "Dal with Rice", mealTypes: ["lunch", "dinner"],
  });
  const withChapati = composeMeal(curry, [{ recipe: chapati, ...stapleTiming(chapati) }], {
    id: "dal-chapati", name: "Dal with Chapati",
  });

  it("serves as many as the main dish and scales the staple to match", () => {
    expect(withRice.servings).toBe(4);
    // Rice was written for two, so four servings need twice as much.
    expect(withRice.ingredients.find((i) => i.ingredientId === "rice")?.grams).toBe(400);
  });

  it("adds the same ingredient from both dishes into one line", () => {
    const salts = withRice.ingredients.filter((i) => i.ingredientId === "salt");
    expect(salts).toHaveLength(1);
    expect(salts[0].grams).toBe(8); // 4 g in the dal and 2 g x 2 in the rice
  });

  it("rewrites the amounts the staple states in its instructions", () => {
    const rinse = withRice.steps.find((s) => s.title.endsWith("Rinse"));
    expect(rinse?.instruction).toBe("Rinse 400 g of rice in 1000 ml of water.");
    expect(rinse?.tip).toBe("Use 4 g of salt.");
    expect(rinse?.addIngredients).toEqual([{ ingredientId: "rice", grams: 400 }]);
  });

  it("puts rice first and chapati last, numbering every step in order", () => {
    expect(withRice.steps[0].title).toBe("Steamed Rice: Rinse");
    expect(withRice.steps.at(-1)?.title).toBe("Season");
    expect(withChapati.steps[0].title).toBe("Boil");
    expect(withChapati.steps.at(-1)?.title).toBe("Chapati: Knead");
    for (const meal of [withRice, withChapati]) {
      meal.steps.forEach((s, i) => {
        expect(s.order).toBe(i + 1);
        expect(s.id).toBe(`${meal.id}-s${i + 1}`);
      });
    }
  });

  it("keeps every ingredient's step weights equal to its recipe weight", () => {
    for (const meal of [withRice, withChapati]) {
      for (const line of meal.ingredients) {
        const added = meal.steps
          .flatMap((s) => s.addIngredients ?? [])
          .filter((a) => a.ingredientId === line.ingredientId)
          .reduce((sum, a) => sum + a.grams, 0);
        expect(added, `${meal.id}/${line.ingredientId}`).toBeCloseTo(line.grams, 1);
      }
    }
  });

  it("adds no time for rice, which cooks while the dal is made", () => {
    expect(withRice.prepTimeMin).toBe(13);
    expect(withRice.cookTimeMin).toBe(25); // the rice, not 20 + 25
  });

  it("adds the time for chapati, which needs hands", () => {
    expect(withChapati.prepTimeMin).toBe(30);
    expect(withChapati.cookTimeMin).toBe(28);
  });

  it("sums nutrition and cost per serving", () => {
    expect(withRice.nutritionPerServing.kcal).toBe(595);
    expect(withRice.nutritionPerServing.carbsG).toBe(116);
    expect(withRice.nutritionPerServing.ironMg).toBe(2);
    expect(withRice.costPerServing).toBe(25);
  });

  it("is a complete meal, and the staple does not take that away", () => {
    expect(isCompleteMeal(withRice)).toBe(true);
    expect(isStaple(withRice)).toBe(false);
  });

  it("tags it complete, drops what the staple makes untrue, and keeps the rest", () => {
    expect(withRice.tags[0]).toBe("complete_meal");
    expect(withRice.tags).not.toContain("staple");
    expect(withRice.tags).not.toContain("low_cal");
    expect(withRice.tags).not.toContain("quick"); // it takes 38 minutes now
    expect(withRice.tags).toContain("budget");
    expect(withRice.tags).toContain("batch_friendly");
  });

  it("takes only the diets every part allows, the hardest difficulty and all the equipment", () => {
    expect(withRice.diets).toEqual(["vegetarian", "vegan"]);
    expect(withChapati.difficulty).toBe("medium");
    expect(withChapati.equipment).toEqual(["stove", "pressure_cooker", "tawa"]);
  });

  it("describes what it is made of and does not touch its sources", () => {
    expect(withRice.description).toBe("Dal served with Steamed Rice.");
    expect(curry.ingredients.find((i) => i.ingredientId === "salt")?.grams).toBe(4);
    expect(rice.steps[0].instruction).toBe("Rinse 200 g of rice in 500 ml of water.");
  });

  it("can be a user's own recipe", () => {
    const mine = composeMeal(curry, [], { id: "mine", name: "Mine", isPublic: false, createdBy: "user-1" });
    expect(mine.isPublic).toBe(false);
    expect(mine.createdBy).toBe("user-1");
    expect(mine.description).toBe(curry.description);
  });

  it("keeps a part's unit when the same ingredient is written another way", () => {
    const egg = makeRecipe({ id: "egg", servings: 2, ingredients: [ri("egg", 100, { unit: "pcs", quantity: 2 })] });
    const eggRice = makeRecipe({ id: "eggrice", servings: 2, ingredients: [ri("egg", 50)] });
    const meal = composeMeal(egg, [{ recipe: eggRice }], { id: "m", name: "M" });
    const line = meal.ingredients.find((i) => i.ingredientId === "egg")!;
    expect(line.unit).toBe("pcs");
    expect(line.grams).toBe(150);
    expect(line.quantity).toBe(3); // 2 pcs per 100 g, so 150 g is 3 pcs
  });
});
