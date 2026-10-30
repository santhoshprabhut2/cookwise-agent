import { describe, expect, it } from "vitest";
import type { MealPlan, PlannedMeal } from "@/lib/types";
import { addDays } from "@/lib/utils";
import { buildGroceryList, groceryTotals } from "../grocery";
import {
  WEEK_START,
  makeIngredient,
  makeMeal,
  makePantryItem,
  makeRecipe,
  ri,
} from "./fixtures";

const day = (n: number) => addDays(WEEK_START, n);
const stamp = "2026-09-14T00:00:00.000Z";

const plan = (meals: PlannedMeal[]): MealPlan => ({
  id: "plan-1", userId: "user-1", weekStart: WEEK_START, meals,
  generatedBy: "heuristic", createdAt: stamp, updatedAt: stamp,
});

const milk = makeIngredient({
  id: "milk", name: "Milk", category: "dairy", defaultUnit: "ml", shelfLifeDays: 4, costPerKg: 60,
});
const chicken = makeIngredient({
  id: "chicken", name: "Chicken", category: "proteins", shelfLifeDays: 2, costPerKg: 260,
});
const rice = makeIngredient({
  id: "rice", name: "Rice", category: "grains", shelfLifeDays: 365, costPerKg: 60,
});
const beans = makeIngredient({
  id: "beans", name: "Beans", category: "vegetables", shelfLifeDays: 30, costPerKg: 70,
});

const porridge = makeRecipe({
  id: "porridge", servings: 1, ingredients: [ri("milk", 200, { name: "Milk", unit: "ml" })],
});
const curry = makeRecipe({
  id: "curry", servings: 1, ingredients: [ri("chicken", 300, { name: "Chicken" })],
});

describe("fresh items are bought in trips", () => {
  it("lists milk with a trip on each day it is needed", () => {
    const meals = [0, 2, 4].map((d) =>
      makeMeal({ id: `m${d}`, date: day(d), mealType: "breakfast", recipeId: "porridge", servings: 1 }),
    );
    const list = buildGroceryList(plan(meals), [porridge], [], [milk]);
    const item = list.items.find((i) => i.ingredientId === "milk");
    expect(item?.fresh?.everyDays).toBe(1);
    expect(item?.fresh?.visits.map((v) => v.date)).toEqual([day(0), day(2), day(4)]);
    expect(item?.grams).toBe(600);
    expect(item?.estimatedCost).toBeCloseTo(36, 5);
  });

  it("covers two days of chicken with one trip, because it keeps two days", () => {
    const meals = [0, 1, 4].map((d) =>
      makeMeal({ id: `m${d}`, date: day(d), mealType: "dinner", recipeId: "curry", servings: 1 }),
    );
    const list = buildGroceryList(plan(meals), [curry], [], [chicken]);
    const visits = list.items.find((i) => i.ingredientId === "chicken")?.fresh?.visits ?? [];
    expect(visits.map((v) => v.date)).toEqual([day(0), day(4)]);
    expect(visits[0].grams).toBe(600);
  });

  it("buys things that keep as one weekly purchase", () => {
    const stew = makeRecipe({ id: "stew", servings: 1, ingredients: [ri("beans", 100, { name: "Beans" })] });
    const meals = [0, 3].map((d) =>
      makeMeal({ id: `m${d}`, date: day(d), mealType: "dinner", recipeId: "stew", servings: 1 }),
    );
    const list = buildGroceryList(plan(meals), [stew], [], [beans]);
    const item = list.items.find((i) => i.ingredientId === "beans");
    expect(item?.fresh).toBeUndefined();
    expect(item?.grams).toBe(200);
  });

  it("subtracts pantry stock before planning the trips", () => {
    const meals = [0, 2].map((d) =>
      makeMeal({ id: `m${d}`, date: day(d), mealType: "breakfast", recipeId: "porridge", servings: 1 }),
    );
    const pantry = [
      makePantryItem({ ingredientId: "milk", quantity: 200, unit: "ml", expiresAt: day(1) }),
    ];
    const list = buildGroceryList(plan(meals), [porridge], pantry, [milk]);
    const visits = list.items.find((i) => i.ingredientId === "milk")?.fresh?.visits ?? [];
    expect(visits.map((v) => v.date)).toEqual([day(2)]);
  });
});

describe("leftovers", () => {
  const stew = makeRecipe({
    id: "stew", servings: 1, ingredients: [ri("beans", 100, { name: "Beans" })],
  });

  const source = (over: Partial<PlannedMeal> = {}) =>
    makeMeal({ id: "src", date: day(1), mealType: "dinner", recipeId: "stew", servings: 1, ...over });
  const leftover = makeMeal({
    id: "left", date: day(2), mealType: "lunch", recipeId: "stew", servings: 1, leftoverOf: "src",
  });

  it("needs the ingredients on the day the dish is cooked, not the day it is reheated", () => {
    // The only stock goes off on the cooking day. If the reheated meal asked for
    // beans the next day, that stock would not count and beans would be listed.
    const pantry = [
      makePantryItem({ ingredientId: "beans", quantity: 200, expiresAt: day(1) }),
    ];
    const list = buildGroceryList(plan([source(), leftover]), [stew], pantry, [beans]);
    expect(list.items.find((i) => i.ingredientId === "beans")).toBeUndefined();
  });

  it("still buys for both meals when the dish is yet to be cooked", () => {
    const list = buildGroceryList(plan([source(), leftover]), [stew], [], [beans]);
    expect(list.items.find((i) => i.ingredientId === "beans")?.grams).toBe(200);
  });

  it("asks for nothing once the dish has already been cooked", () => {
    const list = buildGroceryList(
      plan([source({ status: "cooked" }), leftover]), [stew], [], [beans],
    );
    expect(list.items).toHaveLength(0);
  });
});

describe("what the week actually uses", () => {
  const pilaf = makeRecipe({
    id: "pilaf", servings: 1, ingredients: [ri("rice", 100, { name: "Rice" })],
  });

  it("reports the cost used, which is less than a whole pack", () => {
    const meals = [makeMeal({ id: "m1", date: day(0), mealType: "lunch", recipeId: "pilaf", servings: 1 })];
    const list = buildGroceryList(plan(meals), [pilaf], [], [rice]);
    const item = list.items[0];
    expect(item.grams).toBe(500); // one 500 g pack
    expect(item.estimatedCost).toBeCloseTo(30, 5);
    expect(item.usedCost).toBeCloseTo(6, 5);
  });

  it("sums used cost in the totals, and never exceeds the shopping cost", () => {
    const meals = [
      makeMeal({ id: "m1", date: day(0), mealType: "lunch", recipeId: "pilaf", servings: 1 }),
      makeMeal({ id: "m2", date: day(0), mealType: "dinner", recipeId: "curry", servings: 1 }),
    ];
    const list = buildGroceryList(plan(meals), [pilaf, curry], [], [rice, chicken]);
    const totals = groceryTotals(list);
    expect(totals.usedCost).toBeGreaterThan(0);
    expect(totals.usedCost).toBeLessThanOrEqual(totals.estimatedCost);
  });

  it("buys butter in a small block, not a half-kilo dairy pack", () => {
    const butter = makeIngredient({
      id: "butter", name: "Butter", category: "dairy", shelfLifeDays: 60, costPerKg: 550,
    });
    const toast = makeRecipe({
      id: "toast", servings: 1, ingredients: [ri("butter", 10, { name: "Butter" })],
    });
    const meals = [makeMeal({ id: "m1", date: day(0), mealType: "breakfast", recipeId: "toast", servings: 1 })];
    const item = buildGroceryList(plan(meals), [toast], [], [butter]).items[0];
    expect(item.grams).toBe(100);
    expect(item.estimatedCost).toBeCloseTo(55, 5);
  });

  it("falls back to the shopping cost for lists saved before used cost existed", () => {
    const totals = groceryTotals({
      id: "g", userId: "u", createdAt: stamp, updatedAt: stamp,
      items: [{
        id: "i", listId: "g", ingredientId: "rice", name: "Rice", quantity: 500, unit: "g",
        grams: 500, estimatedCost: 30, purchased: false, addedToPantry: false,
      }],
    });
    expect(totals.usedCost).toBe(30);
  });
});
