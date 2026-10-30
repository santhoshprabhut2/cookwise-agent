import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../seed/ingredients", () => {
  const INGREDIENTS = [
    {
      id: "milk", name: "Milk", category: "dairy", emoji: "🥛", defaultUnit: "ml",
      shelfLifeDays: 4, storage: "fridge", costPerKg: 60,
      nutrition: { kcal: 62, proteinG: 3, carbsG: 5, fatG: 3, fiberG: 0 }, aliases: [],
    },
    {
      id: "rice", name: "Rice", category: "grains", emoji: "🍚", defaultUnit: "g",
      shelfLifeDays: 365, storage: "pantry", costPerKg: 60,
      nutrition: { kcal: 345, proteinG: 7, carbsG: 77, fatG: 1, fiberG: 1 }, aliases: [],
    },
  ];
  const byId = new Map(INGREDIENTS.map((i) => [i.id, i]));
  return { INGREDIENTS, ingredientById: (id: string) => byId.get(id) };
});

const { useGroceryStore } = await import("../stores/grocery");
const { usePantryStore } = await import("../stores/pantry");
const { usePlanStore } = await import("../stores/plan");
const { useRecipeStore } = await import("../stores/recipes");
const { waitForStoresHydrated } = await import("../storage");
const { pendingPantryCount } = await import("../../engines/grocery");
const { makeMeal, makePlan, makeRecipe, makeRecipeIngredient } = await import("./fixtures");

const PORRIDGE = makeRecipe({
  id: "porridge", servings: 1, mealTypes: ["breakfast"],
  ingredients: [
    makeRecipeIngredient({ ingredientId: "milk", name: "Milk", grams: 200, unit: "ml", quantity: 200 }),
    makeRecipeIngredient({ ingredientId: "rice", name: "Rice", grams: 100 }),
  ],
});

// Mon, Wed and Fri breakfasts of the week of 2026-09-14.
const MEALS = ["2026-09-14", "2026-09-16", "2026-09-18"].map((date, i) =>
  makeMeal({ id: `m${i}`, date, mealType: "breakfast", recipeId: "porridge", servings: 1 }),
);

const list = () => useGroceryStore.getState().forPlan("plan-1")!;
const milk = () => list().items.find((i) => i.ingredientId === "milk")!;
const rice = () => list().items.find((i) => i.ingredientId === "rice")!;

beforeAll(async () => {
  await waitForStoresHydrated();
});

beforeEach(() => {
  useGroceryStore.setState({ lists: [] });
  usePantryStore.setState({ items: [] });
  useRecipeStore.setState({ recipes: [PORRIDGE] });
  usePlanStore.setState({ plans: [makePlan({ meals: MEALS })], changes: [] });
  useGroceryStore.getState().generateForPlan("plan-1");
});

describe("a fresh item is shopped trip by trip", () => {
  it("lists milk as three trips and rice as one purchase", () => {
    expect(milk().fresh?.visits.map((v) => v.date)).toEqual([
      "2026-09-14", "2026-09-16", "2026-09-18",
    ]);
    expect(rice().fresh).toBeUndefined();
  });

  it("ticks one trip without ticking the whole item", () => {
    useGroceryStore.getState().toggleVisit(milk().id, "2026-09-16");
    expect(milk().fresh?.visits.map((v) => v.purchased)).toEqual([false, true, false]);
    expect(milk().purchased).toBe(false);
  });

  it("counts the item bought once every trip is ticked", () => {
    for (const v of milk().fresh!.visits) useGroceryStore.getState().toggleVisit(milk().id, v.date);
    expect(milk().purchased).toBe(true);
  });

  it("ticks every trip when the whole item is ticked", () => {
    useGroceryStore.getState().setPurchased(milk().id, true);
    expect(milk().fresh?.visits.every((v) => v.purchased)).toBe(true);
    useGroceryStore.getState().setPurchased(milk().id, false);
    expect(milk().fresh?.visits.some((v) => v.purchased)).toBe(false);
  });
});

describe("moving a shopping list into the pantry", () => {
  it("adds only the trips that were ticked", () => {
    useGroceryStore.getState().toggleVisit(milk().id, "2026-09-14");
    expect(pendingPantryCount(list())).toBe(1);

    const added = useGroceryStore.getState().moveToPantry(list().id);
    expect(added).toHaveLength(1);
    expect(usePantryStore.getState().totalGrams("milk")).toBe(200);
    expect(pendingPantryCount(list())).toBe(0);
  });

  it("adds the next trip later without adding the first one twice", () => {
    useGroceryStore.getState().toggleVisit(milk().id, "2026-09-14");
    useGroceryStore.getState().moveToPantry(list().id);
    useGroceryStore.getState().toggleVisit(milk().id, "2026-09-16");
    useGroceryStore.getState().moveToPantry(list().id);
    expect(usePantryStore.getState().totalGrams("milk")).toBe(400);
    expect(milk().addedToPantry).toBe(false); // Friday's trip is still to come
  });

  it("still moves an ordinary item in one go", () => {
    useGroceryStore.getState().togglePurchased(rice().id);
    expect(pendingPantryCount(list())).toBe(1);
    useGroceryStore.getState().moveToPantry(list().id);
    expect(usePantryStore.getState().totalGrams("rice")).toBe(500);
    expect(rice().addedToPantry).toBe(true);
  });

  it("does nothing when nothing is ticked", () => {
    expect(useGroceryStore.getState().moveToPantry(list().id)).toEqual([]);
  });
});

describe("rebuilding the list", () => {
  it("keeps the ticks on trips that still exist", () => {
    useGroceryStore.getState().toggleVisit(milk().id, "2026-09-16");
    useGroceryStore.getState().generateForPlan("plan-1");
    expect(milk().fresh?.visits.map((v) => v.purchased)).toEqual([false, true, false]);
  });

  it("drops the tick of a trip that is no longer needed", () => {
    useGroceryStore.getState().toggleVisit(milk().id, "2026-09-18");
    usePlanStore.setState({ plans: [makePlan({ meals: MEALS.slice(0, 2) })], changes: [] });
    useGroceryStore.getState().generateForPlan("plan-1");
    expect(milk().fresh?.visits.map((v) => v.date)).toEqual(["2026-09-14", "2026-09-16"]);
    expect(milk().purchased).toBe(false);
  });
});
