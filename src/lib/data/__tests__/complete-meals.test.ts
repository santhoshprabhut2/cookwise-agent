/**
 * The planner against the real catalog: lunch and dinner come out as whole
 * plates, staples are never planned alone, and the week stays inside the budget.
 */

import { describe, expect, it } from "vitest";
import { createDemoProfile } from "../seed/demoUser";
import { INGREDIENTS } from "../seed/ingredients";
import { RECIPES } from "../seed/recipes";
import { isCompleteMeal, isStaple } from "@/lib/engines/meals";
import { WEEKS_PER_MONTH } from "@/lib/engines/constants";
import { generateWeekPlan, scoreRecipe } from "@/lib/engines/planner";
import { recommend } from "@/lib/engines/learning";
import { emptyPreferenceModel } from "@/lib/engines/learning";
import type { UserProfile } from "@/lib/types";

const byId = new Map(RECIPES.map((r) => [r.id, r]));
const WEEK = "2026-10-26";
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

function weekFor(profile: UserProfile, seed: number) {
  return generateWeekPlan({ profile, weekStart: WEEK, pantry: [] }, RECIPES, {
    ingredients: INGREDIENTS,
    today: WEEK,
    seed,
  });
}

const profiles: [string, UserProfile][] = [
  ["Santhosh (non-vegetarian)", createDemoProfile()],
  ["a vegetarian", { ...createDemoProfile(), diet: "vegetarian" }],
  ["a vegan", { ...createDemoProfile(), diet: "vegan" }],
  ["an egg eater", { ...createDemoProfile(), diet: "eggetarian" }],
];

describe.each(profiles)("a week for %s", (_who, profile) => {
  it("makes every lunch and dinner a whole plate", () => {
    for (const seed of SEEDS) {
      for (const m of weekFor(profile, seed).meals) {
        if (m.mealType === "breakfast") continue;
        const recipe = byId.get(m.recipeId)!;
        expect(isCompleteMeal(recipe), `seed ${seed}: ${m.date} ${m.mealType} is ${recipe.id}`).toBe(true);
      }
    }
  });

  it("never plans rice or chapati on its own", () => {
    for (const seed of SEEDS) {
      for (const m of weekFor(profile, seed).meals) {
        expect(isStaple(byId.get(m.recipeId)!), `${m.recipeId}`).toBe(false);
      }
    }
  });
});

describe("the budget", () => {
  const weekly = (profile: UserProfile) => profile.budgetMonthly / WEEKS_PER_MONTH;
  const costOf = (profile: UserProfile, seed: number) =>
    weekFor(profile, seed).meals.reduce(
      (sum, m) => sum + byId.get(m.recipeId)!.costPerServing * m.servings,
      0,
    );

  it("is a ceiling: no week costs more than ₹5,000 a month allows", () => {
    const profile = createDemoProfile();
    for (const seed of SEEDS) {
      expect(costOf(profile, seed), `seed ${seed}`).toBeLessThanOrEqual(weekly(profile) + 0.5);
    }
  });

  it("still fills all twenty-one meals", () => {
    for (const seed of SEEDS) expect(weekFor(createDemoProfile(), seed).meals).toHaveLength(21);
  });

  it("gives a tighter budget a cheaper week", () => {
    const rich = { ...createDemoProfile(), budgetMonthly: 12000 };
    const tight = { ...createDemoProfile(), budgetMonthly: 4000 };
    const avg = (p: UserProfile) => SEEDS.reduce((s, seed) => s + costOf(p, seed), 0) / SEEDS.length;
    expect(avg(tight)).toBeLessThan(avg(rich));
  });
});

describe("variety", () => {
  it("never cooks the same dish twice in one day", () => {
    for (const seed of SEEDS) {
      const days = new Map<string, string[]>();
      for (const m of weekFor(createDemoProfile(), seed).meals) {
        if (m.leftoverOf) continue;
        days.set(m.date, [...(days.get(m.date) ?? []), m.recipeId]);
      }
      for (const [date, ids] of days) {
        expect(new Set(ids).size, `seed ${seed} ${date}`).toBe(ids.length);
      }
    }
  });
});

describe("scoring a lunch", () => {
  const profile = createDemoProfile();
  const slot = { date: WEEK, mealType: "lunch" as const, dayIndex: 0 };
  const breakfast = { ...slot, mealType: "breakfast" as const };

  it("marks down a curry on its own but not the same curry with rice", () => {
    const curry = byId.get("rajma-masala")!;
    const plate = byId.get("rajma-chawal")!;
    expect(scoreRecipe(curry, slot, { profile }).parts.incomplete).toBe(-30);
    expect(scoreRecipe(plate, slot, { profile }).parts.incomplete).toBe(0);
  });

  it("does not expect a whole plate at breakfast", () => {
    expect(scoreRecipe(byId.get("masala-omelette")!, breakfast, { profile }).parts.incomplete).toBe(0);
  });

  it("can be told not to expect one, for a light mood", () => {
    const curry = byId.get("rajma-masala")!;
    expect(scoreRecipe(curry, slot, { profile, waiveCompleteMeal: true }).parts.incomplete).toBe(0);
  });
});

describe("recommendations", () => {
  it("never suggest rice or chapati as a dish to cook", () => {
    const picks = recommend(RECIPES, emptyPreferenceModel("u"), createDemoProfile(), RECIPES.length);
    expect(picks.some(isStaple)).toBe(false);
    expect(picks.length).toBeGreaterThan(20);
  });
});
