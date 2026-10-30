import { describe, expect, it } from "vitest";
import type { Recipe } from "@/lib/types";
import {
  METHOD_TEMP_C,
  buildCustomRecipe,
  customFoodFromRecipe,
  dietsFor,
  validateCustomFood,
  type CustomFoodInput,
} from "../custom";
import { isCompleteMeal } from "../meals";
import { INGREDIENTS, makeRecipe, ri } from "./fixtures";

const base = (over: Partial<CustomFoodInput> = {}): CustomFoodInput => ({
  name: "Mum's egg rice",
  emoji: "🍳",
  kind: "dish",
  mealTypes: ["lunch", "dinner"],
  servings: 2,
  prepMin: 5,
  cookMin: 15,
  method: "saute",
  ingredients: [
    { ingredientId: "egg", grams: 200 },
    { ingredientId: "oil", grams: 20 },
    { ingredientId: "salt", grams: 4 },
  ],
  userId: "user-1",
  ...over,
});

describe("dietsFor", () => {
  it("is non-vegetarian only with meat, widest-first otherwise", () => {
    expect(dietsFor(["chicken", "rice"])).toEqual(["non_vegetarian"]);
    expect(dietsFor(["fish"])).toEqual(["pescatarian", "non_vegetarian"]);
    expect(dietsFor(["egg", "rice"])).toEqual(["eggetarian", "non_vegetarian"]);
    expect(dietsFor(["paneer"])).toEqual(["vegetarian", "eggetarian", "pescatarian", "non_vegetarian"]);
    expect(dietsFor(["rice", "spinach"])).toEqual(["vegetarian", "vegan", "eggetarian", "pescatarian", "non_vegetarian"]);
  });

  it("lets meat win over egg and dairy", () => {
    expect(dietsFor(["egg", "milk", "chicken"])).toEqual(["non_vegetarian"]);
  });
});

describe("validateCustomFood", () => {
  it("accepts a complete form", () => {
    expect(validateCustomFood(base())).toEqual([]);
  });

  it("says what is missing", () => {
    const problems = validateCustomFood(
      base({ name: "  ", mealTypes: [], servings: 0, ingredients: [{ ingredientId: "egg", grams: 0 }] }),
    );
    expect(problems).toHaveLength(4);
  });
});

describe("buildCustomRecipe", () => {
  it("is a private recipe owned by the user", () => {
    const r = buildCustomRecipe(base(), INGREDIENTS);
    expect(r.isPublic).toBe(false);
    expect(r.createdBy).toBe("user-1");
    expect(r.id).toMatch(/^custom-/);
    expect(r.name).toBe("Mum's egg rice");
  });

  it("works out nutrition and cost per serving from the catalog", () => {
    const r = buildCustomRecipe(base(), INGREDIENTS);
    // 200 g egg (143 per 100 g) and 20 g oil (884 per 100 g), shared by two.
    expect(r.nutritionPerServing.kcal).toBeCloseTo((2 * 143 + 0.2 * 884) / 2, 0);
    // 0.2 kg x 240 + 0.02 kg x 150 + 0.004 kg x 20, shared by two.
    expect(r.costPerServing).toBe(Math.round((48 + 3 + 0.08) / 2));
  });

  it("writes each ingredient the way the catalog counts it", () => {
    const r = buildCustomRecipe(base(), INGREDIENTS);
    expect(r.ingredients.find((i) => i.ingredientId === "egg")).toMatchObject({ name: "Egg", unit: "pcs", quantity: 4, grams: 200 });
    expect(r.ingredients.find((i) => i.ingredientId === "oil")).toMatchObject({ unit: "ml", grams: 20 });
  });

  it("combines a repeated ingredient and ignores unknown ones and empty weights", () => {
    const r = buildCustomRecipe(
      base({
        ingredients: [
          { ingredientId: "egg", grams: 100 },
          { ingredientId: "egg", grams: 100 },
          { ingredientId: "dragon-fruit", grams: 50 },
          { ingredientId: "salt", grams: 0 },
        ],
      }),
      INGREDIENTS,
    );
    expect(r.ingredients).toHaveLength(1);
    expect(r.ingredients[0].grams).toBe(200);
  });

  it("suits only the diets its ingredients allow", () => {
    expect(buildCustomRecipe(base(), INGREDIENTS).diets).toEqual(["eggetarian", "non_vegetarian"]);
  });

  it("tags a complete meal, a staple, and what is true of the numbers", () => {
    expect(buildCustomRecipe(base({ kind: "meal" }), INGREDIENTS).tags).toContain("complete_meal");
    expect(buildCustomRecipe(base({ kind: "side" }), INGREDIENTS).tags).toContain("staple");
    const plain = buildCustomRecipe(base({ prepMin: 5, cookMin: 10 }), INGREDIENTS);
    expect(plain.tags).toContain("quick");
    expect(plain.tags).not.toContain("complete_meal");
    expect(buildCustomRecipe(base({ prepMin: 20, cookMin: 30 }), INGREDIENTS).tags).not.toContain("quick");
  });

  it("gets steps the cooking screen can run: weigh, cook at a temperature, serve", () => {
    const r = buildCustomRecipe(base({ howTo: "Fry the egg, then stir in the rice." }), INGREDIENTS);
    expect(r.steps.map((s) => s.title)).toEqual(["Weigh and prepare", "Cook", "Serve"]);
    expect(r.steps.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(r.steps[1].instruction).toBe("Fry the egg, then stir in the rice.");
    expect(r.steps[1].method).toBe("saute");
    expect(r.steps[1].targetTempC).toEqual({ min: METHOD_TEMP_C.saute![0], max: METHOD_TEMP_C.saute![1] });
    expect(r.steps[1].durationSec).toBe(900);
  });

  it("asks the scale for every ingredient in the first step, exactly as listed", () => {
    const r = buildCustomRecipe(base(), INGREDIENTS);
    expect(r.steps[0].addIngredients).toEqual(
      r.ingredients.map((i) => ({ ingredientId: i.ingredientId, grams: i.grams })),
    );
  });

  it("has no heat step for something that is only mixed", () => {
    const r = buildCustomRecipe(base({ method: "raw", cookMin: 0 }), INGREDIENTS);
    expect(r.steps.map((s) => s.title)).toEqual(["Weigh and prepare", "Mix", "Serve"]);
    expect(r.steps.some((s) => s.method || s.targetTempC)).toBe(false);
  });

  const rice: Recipe = makeRecipe({
    id: "rice", name: "Steamed Rice", servings: 2, tags: ["staple"], primaryMethod: "simmer",
    ingredients: [ri("rice", 200)],
    steps: [{ id: "r1", order: 1, title: "Cook", instruction: "Cook 200 g of rice.", method: "simmer", durationSec: 900 }],
    nutritionPerServing: { kcal: 360, proteinG: 7, carbsG: 79, fatG: 1, fiberG: 1 },
    costPerServing: 7,
  });

  it("makes a dish into one complete meal when it is served with a staple", () => {
    const r = buildCustomRecipe(base({ serveWith: [rice] }), INGREDIENTS);
    expect(r.ingredients.some((i) => i.ingredientId === "rice" && i.grams === 200)).toBe(true);
    expect(isCompleteMeal(r)).toBe(true);
    expect(r.tags[0]).toBe("complete_meal");
    expect(r.isPublic).toBe(false);
    expect(r.createdBy).toBe("user-1");
    expect(r.id).toMatch(/^custom-/);
  });

  it("serves last, after the staple's own steps", () => {
    const r = buildCustomRecipe(base({ serveWith: [rice] }), INGREDIENTS);
    const titles = r.steps.map((s) => s.title);
    expect(titles.filter((t) => t === "Serve")).toHaveLength(1);
    expect(titles[titles.length - 1]).toBe("Serve");
    expect(r.steps.map((s) => s.order)).toEqual(r.steps.map((_, i) => i + 1));
    expect(new Set(r.steps.map((s) => s.id)).size).toBe(r.steps.length);
  });

  it("does not add staples to something that is already a plate or is itself a staple", () => {
    for (const kind of ["meal", "side"] as const) {
      const r = buildCustomRecipe(base({ kind, serveWith: [rice] }), INGREDIENTS);
      expect(r.ingredients.some((i) => i.ingredientId === "rice"), kind).toBe(false);
    }
  });
});

describe("editing a custom food", () => {
  it("reads a built recipe back into the same form values", () => {
    const original = buildCustomRecipe(base({ kind: "meal", howTo: "Fry it all." }), INGREDIENTS);
    const input = customFoodFromRecipe(original, "user-1");
    expect(input).toMatchObject({
      id: original.id, name: "Mum's egg rice", kind: "meal", servings: 2, prepMin: 5, cookMin: 15,
      method: "saute", howTo: "Fry it all.",
    });
    const again = buildCustomRecipe(input, INGREDIENTS);
    expect(again.id).toBe(original.id);
    expect(again.nutritionPerServing).toEqual(original.nutritionPerServing);
    expect(again.ingredients).toEqual(original.ingredients);
  });

  it("does not turn the placeholder wording into the user's own method", () => {
    const original = buildCustomRecipe(base(), INGREDIENTS);
    expect(customFoodFromRecipe(original, "user-1").howTo).toBe("");
  });
});
