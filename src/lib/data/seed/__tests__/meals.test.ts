import { describe, expect, it } from "vitest";
import { isCompleteMeal, isStaple } from "@/lib/engines/meals";
import { MEAL_PAIRINGS } from "../meals";
import { RECIPES, recipeById } from "../recipes";

const complete = RECIPES.filter((r) => r.tags.includes("complete_meal"));

describe("the staples", () => {
  it.each(["steamed-rice", "chapati"])("%s exists and is never planned on its own", (id) => {
    const staple = recipeById(id);
    expect(staple, id).toBeDefined();
    expect(isStaple(staple!)).toBe(true);
    expect(isCompleteMeal(staple!)).toBe(false);
  });

  it("carry real carbohydrate, so a plate with them is a plate", () => {
    expect(recipeById("steamed-rice")!.nutritionPerServing.carbsG).toBeGreaterThan(60);
    expect(recipeById("chapati")!.nutritionPerServing.carbsG).toBeGreaterThan(50);
  });
});

describe("the complete meals", () => {
  it("builds every pairing: none is skipped for naming a recipe that does not exist", () => {
    for (const p of MEAL_PAIRINGS) {
      expect(recipeById(p.id), `${p.id} was not built`).toBeDefined();
    }
    expect(new Set(MEAL_PAIRINGS.map((p) => p.id)).size).toBe(MEAL_PAIRINGS.length);
  });

  it("offers plenty of choice, with rice, chapati and thalis", () => {
    expect(MEAL_PAIRINGS.length).toBeGreaterThanOrEqual(20);
    expect(MEAL_PAIRINGS.filter((p) => p.with.includes("steamed-rice")).length).toBeGreaterThanOrEqual(8);
    expect(MEAL_PAIRINGS.filter((p) => p.with.includes("chapati")).length).toBeGreaterThanOrEqual(8);
    expect(MEAL_PAIRINGS.filter((p) => p.with.length > 1).length).toBeGreaterThanOrEqual(2);
  });

  it("is a whole plate: the main dish and every part, together", () => {
    for (const p of MEAL_PAIRINGS) {
      const meal = recipeById(p.id)!;
      const needed = [p.main, ...p.with].flatMap((id) => recipeById(id)!.ingredients.map((i) => i.ingredientId));
      for (const ingredientId of needed) {
        expect(
          meal.ingredients.some((i) => i.ingredientId === ingredientId),
          `${p.id} is missing ${ingredientId}`,
        ).toBe(true);
      }
      expect(isCompleteMeal(meal), p.id).toBe(true);
      expect(meal.nutritionPerServing.carbsG, p.id).toBeGreaterThanOrEqual(50);
    }
  });

  it("has more energy than the dish alone, by about a serving of the staple", () => {
    const dal = recipeById("dal-tadka")!;
    const dalRice = recipeById("dal-rice")!;
    expect(dalRice.nutritionPerServing.kcal - dal.nutritionPerServing.kcal).toBeGreaterThan(300);
  });

  it("is a lunch and dinner, except the bhurji plates which also suit breakfast", () => {
    expect(recipeById("dal-rice")!.mealTypes).toEqual(["lunch", "dinner"]);
    expect(recipeById("egg-bhurji-chapati")!.mealTypes).toEqual(["breakfast", "dinner"]);
  });

  it("includes vegan, vegetarian, egg and fish plates, so every diet has a whole plate", () => {
    const has = (diet: string) => complete.some((r) => r.diets.includes(diet as never));
    expect(complete.filter((r) => r.diets.includes("vegan")).length).toBeGreaterThanOrEqual(4);
    expect(has("vegetarian")).toBe(true);
    expect(has("eggetarian")).toBe(true);
    expect(has("pescatarian")).toBe(true);
  });

  it("keeps the main dish's own recipe, so a change to the dal reaches every plate with dal", () => {
    const dal = recipeById("dal-tadka")!;
    const plate = recipeById("dal-rice")!;
    const dalSteps = dal.steps.map((s) => s.instruction);
    for (const text of dalSteps) {
      expect(plate.steps.map((s) => s.instruction)).toContain(text);
    }
  });

  it("is tagged so the Complete Meal label leads", () => {
    for (const p of MEAL_PAIRINGS) expect(recipeById(p.id)!.tags[0], p.id).toBe("complete_meal");
  });
});
