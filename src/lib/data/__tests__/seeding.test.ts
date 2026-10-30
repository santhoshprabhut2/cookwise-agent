/**
 * End-to-end smoke test for demo seeding.
 *
 * `window` is stubbed so `ensureSeeded()` takes the browser path; `indexedDB` is
 * still undefined, so Dexie degrades to the in-memory kv fallback — which is
 * exactly the "private browsing" path the hydration timeout protects.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { daysBetween } from "@/lib/engines/helpers";
import { slotTimeLimit, totalMinutes } from "@/lib/engines/planner";
import type { MealType } from "@/lib/types";
import { toISODate, weekStartOf } from "@/lib/utils";

vi.stubGlobal("window", globalThis);

const { ensureSeeded, resetDemoData } = await import("../seed");
const { useCookStore } = await import("../stores/cook");
const { useGroceryStore } = await import("../stores/grocery");
const { usePantryStore } = await import("../stores/pantry");
const { usePlanStore } = await import("../stores/plan");
const { useProfileStore } = await import("../stores/profile");
const { useRecipeStore } = await import("../stores/recipes");
const { isAppHydrated } = await import("../storage");
const { nextMealToday, todaysMeals } = await import("../selectors");
const { DEMO_PANTRY, DEMO_TODAY_MEALS } = await import("../seed/demoUser");

const TODAY = toISODate();

beforeAll(async () => {
  await ensureSeeded();
});

describe("ensureSeeded", () => {
  it("opens the hydration gate", () => {
    expect(isAppHydrated()).toBe(true);
  });

  it("creates the onboarded demo profile", () => {
    const profile = useProfileStore.getState().profile;
    expect(profile?.name).toBe("Santhosh");
    expect(profile?.onboardingComplete).toBe(true);
    expect(profile?.goal).toBe("muscle_gain");
    expect(profile?.dailyCalorieTarget).toBe(2500);
  });

  it("creates the mockup pantry with expiry relative to today", () => {
    const items = usePantryStore.getState().items;
    expect(items).toHaveLength(DEMO_PANTRY.length);

    const tomato = items.find((i) => i.ingredientId === "tomato");
    expect(tomato?.quantity).toBe(500);
    expect(tomato?.unit).toBe("g");

    const eggs = items.find((i) => i.ingredientId === "egg");
    expect(eggs?.quantity).toBe(6);
    expect(eggs?.unit).toBe("pcs");

    // Tomato (2 d), chicken (3 d) and spinach (3 d) drive the "expiring" chips.
    const expiring = usePantryStore.getState().expiring(3);
    expect(expiring.map((i) => i.ingredientId)).toContain("tomato");
    expect(expiring.length).toBeGreaterThanOrEqual(3);
  });

  it("plans the current week with the mockup meals for today, where they fit the schedule", () => {
    const plan = usePlanStore.getState().currentPlan(weekStartOf(TODAY));
    expect(plan).toBeDefined();

    const profile = useProfileStore.getState().profile!;
    const meals = todaysMeals(plan, TODAY);
    const byType = Object.fromEntries(meals.map((m) => [m.mealType, m]));
    const dayIndex = daysBetween(weekStartOf(TODAY), TODAY);

    // A mockup dish is forced only where today's schedule leaves time to cook it.
    for (const [mealType, recipeId] of Object.entries(DEMO_TODAY_MEALS)) {
      const recipe = useRecipeStore.getState().byId(recipeId)!;
      const slot = { date: TODAY, mealType: mealType as MealType, dayIndex };
      if (totalMinutes(recipe) <= slotTimeLimit(profile, slot)) {
        expect(byType[mealType]?.recipeId, mealType).toBe(recipeId);
      }
    }
    // Dinner is free every day, so Home always has Egg Bhurji to offer next.
    expect(byType.dinner?.recipeId).toBe("egg-bhurji-chapati");

    // Breakfast + lunch are already cooked, so Home surfaces Egg Bhurji.
    expect(byType.breakfast?.status).toBe("cooked");
    expect(byType.lunch?.status).toBe("cooked");
    expect(nextMealToday(plan, TODAY)?.recipeId).toBe("egg-bhurji-chapati");
  });

  it("records completed sessions for the cooked meals without touching the pantry", () => {
    const sessions = useCookStore.getState().sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.status === "completed")).toBe(true);
    expect(sessions.every((s) => s.pantryDeducted)).toBe(true);
    expect(useCookStore.getState().activeId).toBeNull();
    // The pantry still matches the mockup exactly.
    expect(usePantryStore.getState().items).toHaveLength(DEMO_PANTRY.length);
  });

  it("generates a grocery list for the plan", () => {
    const plan = usePlanStore.getState().currentPlan(weekStartOf(TODAY))!;
    expect(useGroceryStore.getState().forPlan(plan.id)).toBeDefined();
  });

  it("exposes the recipe catalog", () => {
    expect(useRecipeStore.getState().recipes.length).toBeGreaterThan(0);
    expect(useRecipeStore.getState().byId("egg-bhurji")).toBeDefined();
  });

  it("is idempotent", async () => {
    const pantryCount = usePantryStore.getState().items.length;
    const planCount = usePlanStore.getState().plans.length;
    const sessionCount = useCookStore.getState().sessions.length;

    await ensureSeeded();
    await ensureSeeded();

    expect(usePantryStore.getState().items).toHaveLength(pantryCount);
    expect(usePlanStore.getState().plans).toHaveLength(planCount);
    expect(useCookStore.getState().sessions).toHaveLength(sessionCount);
  });
});

describe("resetDemoData", () => {
  it("wipes and re-seeds the demo data", async () => {
    usePantryStore.getState().add({ ingredientId: "tomato", quantity: 999 });
    expect(usePantryStore.getState().items).toHaveLength(
      DEMO_PANTRY.length + 1,
    );

    await resetDemoData();

    expect(usePantryStore.getState().items).toHaveLength(DEMO_PANTRY.length);
    expect(useProfileStore.getState().profile?.name).toBe("Santhosh");
    expect(usePlanStore.getState().plans).toHaveLength(1);
  });
});
