import { describe, expect, it } from "vitest";
import type { Recipe } from "@/lib/types";
import { makeRecipe, ri } from "@/lib/engines/__tests__/fixtures";
import { ingredientRows, totalGrams } from "../ingredients";

const recipe: Recipe = makeRecipe({
  id: "bhurji",
  servings: 2,
  ingredients: [
    ri("egg", 300, { name: "Egg", unit: "pcs", quantity: 6 }),
    ri("onion", 100, { name: "Onion", unit: "pcs", quantity: 1 }),
    ri("oil", 14, { name: "Sunflower Oil", unit: "ml", quantity: 15 }),
    ri("pepper", 1, { name: "Black Pepper" }),
    ri("salt", 3, { name: "Salt" }),
  ],
});

describe("ingredientRows", () => {
  it("states each amount for the servings asked, in grams and pieces", () => {
    const rows = ingredientRows(recipe, 1);
    expect(rows.find((r) => r.name === "Egg")?.amount).toBe("3 pcs · 150 g");
    expect(rows.find((r) => r.name === "Onion")?.amount).toBe("0.5 pcs · 50 g");
  });

  it("keeps the recipe's own amounts at its own servings", () => {
    const rows = ingredientRows(recipe, 2);
    expect(rows.find((r) => r.name === "Egg")?.amount).toBe("6 pcs · 300 g");
    expect(rows.find((r) => r.name === "Salt")?.amount).toBe("3 g");
  });

  it("shows liquids in millilitres", () => {
    expect(ingredientRows(recipe, 2).find((r) => r.name === "Sunflower Oil")?.amount).toBe("15 ml");
  });

  it("keeps a decimal for tiny amounts so a pinch is not rounded away", () => {
    expect(ingredientRows(recipe, 1).find((r) => r.name === "Black Pepper")?.amount).toBe("0.5 g");
  });

  it("scales up for a double batch", () => {
    expect(ingredientRows(recipe, 4).find((r) => r.name === "Egg")?.amount).toBe("12 pcs · 600 g");
  });

  it("totals the weight", () => {
    expect(totalGrams(ingredientRows(recipe, 2))).toBe(418);
  });
});
