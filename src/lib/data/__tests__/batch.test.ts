import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RetentionEstimate } from "@/lib/types";

vi.mock("../seed/ingredients", () => {
  const INGREDIENTS = [
    {
      id: "beans", name: "Beans", category: "vegetables", emoji: "🫘", defaultUnit: "g",
      shelfLifeDays: 30, storage: "pantry", costPerKg: 70,
      nutrition: { kcal: 31, proteinG: 2, carbsG: 7, fatG: 0, fiberG: 3 }, aliases: [],
    },
  ];
  const byId = new Map(INGREDIENTS.map((i) => [i.id, i]));
  return { INGREDIENTS, ingredientById: (id: string) => byId.get(id) };
});

vi.mock("../../engines/retention", () => ({
  estimateRetention: (): RetentionEstimate => ({
    overall: 0.8, nutrients: [], warnings: [], tips: [], computedAt: "2026-09-15T00:00:00.000Z",
  }),
  liveRetentionHint: () => ({ tone: "ok" as const, message: "" }),
}));

const { useCookStore } = await import("../stores/cook");
const { usePantryStore } = await import("../stores/pantry");
const { usePlanStore } = await import("../stores/plan");
const { useProfileStore } = await import("../stores/profile");
const { useRecipeStore } = await import("../stores/recipes");
const { waitForStoresHydrated } = await import("../storage");
const { cookServingsFor, dailyIntake, leftoversOf } = await import("../selectors");
const { makeMeal, makePlan, makeProfile, makeRecipe, makeRecipeIngredient } = await import("./fixtures");

const RECIPE = makeRecipe({
  id: "stew",
  servings: 2,
  mealTypes: ["lunch", "dinner"],
  ingredients: [makeRecipeIngredient({ ingredientId: "beans", grams: 200 })],
  nutritionPerServing: { kcal: 300, proteinG: 20, carbsG: 25, fatG: 10, fiberG: 4 },
});

const SOURCE = makeMeal({ id: "src", recipeId: "stew", mealType: "lunch", servings: 1 });
const LEFTOVER = makeMeal({
  id: "left", recipeId: "stew", mealType: "dinner", servings: 1, leftoverOf: "src",
});

function seedPlan(meals = [SOURCE, LEFTOVER]) {
  usePlanStore.setState({ plans: [makePlan({ meals })], changes: [] });
}

beforeAll(async () => {
  await waitForStoresHydrated();
});

beforeEach(() => {
  useCookStore.setState({ sessions: [], activeId: null });
  useRecipeStore.setState({ recipes: [RECIPE] });
  usePantryStore.setState({ items: [] });
  usePantryStore.getState().add({ ingredientId: "beans", quantity: 1000 });
  useProfileStore.setState({ profile: makeProfile() });
  seedPlan();
});

describe("selectors", () => {
  const plan = () => usePlanStore.getState().plans[0];

  it("finds the leftovers of a dish", () => {
    expect(leftoversOf(plan(), "src").map((m) => m.id)).toEqual(["left"]);
    expect(leftoversOf(plan(), "left")).toEqual([]);
    expect(leftoversOf(undefined, "src")).toEqual([]);
  });

  it("counts every waiting portion when working out how much to cook", () => {
    expect(cookServingsFor(plan(), SOURCE)).toBe(2);
    expect(cookServingsFor(plan(), LEFTOVER)).toBe(1);
  });

  it("stops counting a leftover once it has been eaten", () => {
    seedPlan([SOURCE, { ...LEFTOVER, status: "cooked" }]);
    expect(cookServingsFor(plan(), SOURCE)).toBe(1);
  });
});

describe("cooking a dish for two meals", () => {
  it("deducts the pantry for every portion but counts only the cook's own as eaten", () => {
    useCookStore.getState().start("stew", 2, "src"); // 1 now + 1 leftover
    const done = useCookStore.getState().complete();

    // 200 g per 2 servings, so a double batch of 2 servings uses 200 g.
    expect(usePantryStore.getState().totalGrams("beans")).toBe(800);
    expect(done?.servings).toBe(1);
    expect(usePlanStore.getState().mealById("src")?.status).toBe("cooked");
    // The leftover is still waiting to be eaten.
    expect(usePlanStore.getState().mealById("left")?.status).toBe("planned");
  });

  it("leaves a normal meal's servings alone", () => {
    seedPlan([{ ...SOURCE, id: "solo" }]);
    useCookStore.getState().start("stew", 1, "solo");
    expect(useCookStore.getState().complete()?.servings).toBe(1);
  });
});

describe("logging a leftover", () => {
  it("counts the portion in the day's intake and marks the meal eaten", () => {
    useCookStore.getState().start("stew", 2, "src");
    useCookStore.getState().complete();
    const session = useCookStore.getState().logLeftover("left");

    expect(session?.status).toBe("completed");
    expect(session?.servings).toBe(1);
    expect(session?.pantryDeducted).toBe(true);
    expect(usePlanStore.getState().mealById("left")?.status).toBe("cooked");

    // Both portions are eaten, and each is counted exactly once.
    const intake = dailyIntake(useCookStore.getState().sessions, [RECIPE]);
    expect(intake.kcal).toBe(600);
    expect(intake.mealsLogged).toBe(2);
  });

  it("never touches the pantry", () => {
    useCookStore.getState().logLeftover("left");
    expect(usePantryStore.getState().totalGrams("beans")).toBe(1000);
  });

  it("ignores a meal that is not a leftover, or is already eaten", () => {
    expect(useCookStore.getState().logLeftover("src")).toBeUndefined();
    useCookStore.getState().logLeftover("left");
    expect(useCookStore.getState().logLeftover("left")).toBeUndefined();
    expect(useCookStore.getState().sessions).toHaveLength(1);
  });
});

describe("the plan store keeps leftover links honest", () => {
  const link = () => usePlanStore.getState().mealById("left")?.leftoverOf;

  it("drops the link when the leftover is swapped for another dish", () => {
    usePlanStore.getState().swapMeal("left", "other");
    expect(link()).toBeUndefined();
  });

  it("drops the link when the dish it came from changes", () => {
    usePlanStore.getState().swapMeal("src", "other");
    expect(link()).toBeUndefined();
  });

  it("drops the link when the dish it came from is removed", () => {
    usePlanStore.getState().removeMeal("src");
    expect(usePlanStore.getState().mealById("left")).toBeDefined();
    expect(link()).toBeUndefined();
  });

  it("gives a rushed meal a quick dish when the leftover it was is cut loose", () => {
    const QUICK = makeRecipe({ id: "quick", mealTypes: ["dinner"], prepTimeMin: 4, cookTimeMin: 4 });
    useRecipeStore.setState({ recipes: [RECIPE, QUICK] });
    useProfileStore.setState({
      profile: makeProfile({ timeSchedule: { mon: { dinner: "very_little" } } }),
    });
    usePlanStore.getState().swapMeal("src", "other");
    // "stew" takes 20 minutes, the dinner slot allows 10.
    expect(usePlanStore.getState().mealById("left")?.recipeId).toBe("quick");
    expect(link()).toBeUndefined();
  });

  it("leaves an orphaned meal alone when its slot is not capped", () => {
    useProfileStore.setState({ profile: makeProfile({ timeSchedule: undefined }) });
    usePlanStore.getState().swapMeal("src", "other");
    expect(usePlanStore.getState().mealById("left")?.recipeId).toBe("stew");
  });

  it("keeps the link through harmless edits", () => {
    usePlanStore.getState().updateMeal("left", { servings: 2 });
    usePlanStore.getState().lockMeal("src", true);
    expect(link()).toBe("src");
  });
});
