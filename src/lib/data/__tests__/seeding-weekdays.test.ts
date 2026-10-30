/**
 * The demo seeds the same profile every day of the week, so the seeded plan has
 * to respect that profile's own schedule on every one of those days. The clock
 * is faked to each day in turn and the whole demo is seeded again.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.stubGlobal("window", globalThis);

const { ensureSeeded, resetDemoData } = await import("../seed");
const { useProfileStore } = await import("../stores/profile");
const { usePlanStore } = await import("../stores/plan");
const { useRecipeStore } = await import("../stores/recipes");
const { nextMealToday, todaysMeals } = await import("../selectors");
const { slotTimeLimit, totalMinutes } = await import("../../engines/planner");
const { daysBetween } = await import("../../engines/helpers");
const { toISODate, weekStartOf, addDays } = await import("@/lib/utils");

// A Monday in the middle of the demo's lifetime.
const MONDAY = "2026-10-26";
const DAYS = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${MONDAY}T10:00:00`));
  await ensureSeeded();
});

afterAll(() => {
  vi.useRealTimers();
});

describe.each(DAYS)("seeding on %s", (day) => {
  it("respects the profile's weekly schedule for the whole week", async () => {
    vi.setSystemTime(new Date(`${day}T10:00:00`));
    expect(toISODate()).toBe(day);
    await resetDemoData();

    const profile = useProfileStore.getState().profile!;
    const plan = usePlanStore.getState().currentPlan(weekStartOf(day))!;
    expect(plan.meals.length).toBeGreaterThanOrEqual(21);

    for (const meal of plan.meals) {
      if (meal.leftoverOf) continue; // reheating needs no cooking time
      const recipe = useRecipeStore.getState().byId(meal.recipeId)!;
      const slot = {
        date: meal.date,
        mealType: meal.mealType,
        dayIndex: daysBetween(plan.weekStart, meal.date),
      };
      expect(
        totalMinutes(recipe),
        `${meal.date} ${meal.mealType}: ${recipe.id}`,
      ).toBeLessThanOrEqual(slotTimeLimit(profile, slot));
    }
  });

  it("still leaves Egg Bhurji with Chapati as the next meal on Home", () => {
    const plan = usePlanStore.getState().currentPlan(weekStartOf(day));
    const meals = todaysMeals(plan, day);
    expect(meals.map((m) => m.mealType)).toEqual(
      expect.arrayContaining(["breakfast", "lunch", "dinner"]),
    );
    expect(nextMealToday(plan, day, new Date(`${day}T10:00:00`))?.recipeId).toBe("egg-bhurji-chapati");
  });
});
