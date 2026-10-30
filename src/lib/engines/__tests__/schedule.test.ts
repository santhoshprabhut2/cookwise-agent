import { describe, expect, it } from "vitest";
import type { MealPlan, PlannedMeal, Recipe, ScheduleChange } from "@/lib/types";
import { addDays } from "@/lib/utils";
import {
  adaptPlan,
  fitMealsToSchedule,
  generateWeekPlan,
  isBatchable,
  sanitizeLeftovers,
  scoreRecipe,
  simplicityFit,
  slotTimeLimit,
  totalMinutes,
} from "../planner";
import {
  INGREDIENTS,
  WEEK_START,
  makeMeal,
  makeProfile,
  makeRecipe,
  ri,
} from "./fixtures";

const SLOT = { date: WEEK_START, mealType: "breakfast" as const, dayIndex: 0 };

function planFor(
  profile: ReturnType<typeof makeProfile>,
  recipes: Recipe[],
  extra: Partial<Parameters<typeof generateWeekPlan>[0]> = {},
  seed = 1,
): MealPlan {
  return generateWeekPlan(
    { profile, weekStart: WEEK_START, pantry: [], ...extra },
    recipes,
    { ingredients: INGREDIENTS, today: WEEK_START, seed },
  );
}

const mealAt = (plan: MealPlan, dayIndex: number, mealType: PlannedMeal["mealType"]) =>
  plan.meals.find((m) => m.date === addDays(WEEK_START, dayIndex) && m.mealType === mealType);

function recipeNamed(recipes: Recipe[], id: string): Recipe {
  const found = recipes.find((r) => r.id === id);
  if (!found) throw new Error(`no recipe ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// Per-meal cooking time
// ---------------------------------------------------------------------------

describe("slotTimeLimit", () => {
  const profile = makeProfile({
    timeAvailability: "medium",
    timeSchedule: {
      mon: { breakfast: "little", lunch: "plenty" },
      wed: { lunch: "very_little" },
      fri: { lunch: "some" },
    },
  });

  it("reads the minutes for each level from the weekly schedule", () => {
    expect(slotTimeLimit(profile, { ...SLOT, mealType: "breakfast", dayIndex: 0 })).toBe(20);
    expect(slotTimeLimit(profile, { ...SLOT, mealType: "lunch", dayIndex: 2 })).toBe(10);
    expect(slotTimeLimit(profile, { ...SLOT, mealType: "lunch", dayIndex: 4 })).toBe(30);
    expect(slotTimeLimit(profile, { ...SLOT, mealType: "lunch", dayIndex: 0 })).toBe(Infinity);
  });

  it("falls back to the single time setting where the schedule is silent", () => {
    // medium = 35 minutes
    expect(slotTimeLimit(profile, { ...SLOT, mealType: "dinner", dayIndex: 1 })).toBe(35);
    expect(slotTimeLimit(profile, { ...SLOT, mealType: "snack", dayIndex: 2 })).toBe(35);
  });

  it("behaves exactly as before when there is no schedule", () => {
    const plain = makeProfile({ timeAvailability: "low", timeSchedule: undefined });
    expect(slotTimeLimit(plain, SLOT)).toBe(20);
  });
});

describe("a capped slot is a rule, not a preference", () => {
  // The fast breakfast is nutritionally poor and the slow one is excellent, so
  // the slow one wins on score alone. Only the hard cap can keep it out.
  const fast = makeRecipe({
    id: "fast-bf", mealTypes: ["breakfast"], prepTimeMin: 3, cookTimeMin: 4,
    nutritionPerServing: { kcal: 90, proteinG: 2, carbsG: 15, fatG: 2, fiberG: 1 },
  });
  const slow = makeRecipe({
    id: "slow-bf", mealTypes: ["breakfast"], prepTimeMin: 20, cookTimeMin: 25,
    nutritionPerServing: { kcal: 620, proteinG: 40, carbsG: 60, fatG: 20, fiberG: 9 },
  });
  const lunch = makeRecipe({ id: "lunch-a", mealTypes: ["lunch"], prepTimeMin: 20, cookTimeMin: 20 });
  const dinner = makeRecipe({ id: "dinner-a", mealTypes: ["dinner"], prepTimeMin: 20, cookTimeMin: 20 });

  it("never picks a recipe longer than the slot allows", () => {
    const profile = makeProfile({
      timeAvailability: "high",
      goal: "muscle_gain",
      timeSchedule: { thu: { breakfast: "very_little" } },
    });
    for (let seed = 1; seed <= 8; seed += 1) {
      const plan = planFor(profile, [fast, slow, lunch, dinner], {}, seed);
      expect(mealAt(plan, 3, "breakfast")?.recipeId, `seed ${seed}`).toBe("fast-bf");
    }
  });

  it("offers a recipe of another meal type when only that one fits", () => {
    const quickSnack = makeRecipe({
      id: "quick-snack", mealTypes: ["snack", "breakfast"], prepTimeMin: 4, cookTimeMin: 3,
    });
    const all = [quickSnack, lunch, dinner, slow];
    const profile = makeProfile({
      timeAvailability: "high",
      timeSchedule: { wed: { lunch: "very_little" } },
    });
    const wedLunch = mealAt(planFor(profile, all), 2, "lunch");
    expect(wedLunch).toBeDefined();
    expect(totalMinutes(recipeNamed(all, wedLunch!.recipeId))).toBeLessThanOrEqual(10);
  });

  it("still fills the slot with the fastest dishes when nothing fits", () => {
    const profile = makeProfile({
      timeAvailability: "high",
      timeSchedule: { tue: { lunch: "very_little" } },
    });
    expect(mealAt(planFor(profile, [fast, lunch, dinner]), 1, "lunch")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Simple dishes
// ---------------------------------------------------------------------------

describe("simplicity", () => {
  const steps = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i}`, order: i + 1, title: "t", instruction: "i" }));
  const easy = makeRecipe({
    id: "easy", difficulty: "easy",
    ingredients: [ri("a", 10), ri("b", 10), ri("c", 10)],
    steps: steps(4),
  });
  const hard = makeRecipe({
    id: "hard", difficulty: "hard",
    ingredients: Array.from({ length: 16 }, (_, i) => ri(`i${i}`, 10)),
    steps: steps(8),
  });

  it("rates a short, easy recipe above a long, hard one", () => {
    expect(simplicityFit(easy)).toBeGreaterThan(simplicityFit(hard) + 40);
  });

  it("pulls a beginner towards the easy recipe at equal cooking time", () => {
    const beginner = makeProfile({ skill: "beginner" });
    const a = scoreRecipe(easy, SLOT, { profile: beginner }).parts.time;
    const b = scoreRecipe(hard, SLOT, { profile: beginner }).parts.time;
    expect(a).toBeGreaterThan(b);
  });

  it("does not nudge an advanced cook", () => {
    const expert = makeProfile({ skill: "advanced" });
    const a = scoreRecipe(easy, SLOT, { profile: expert }).parts.time;
    const b = scoreRecipe(hard, SLOT, { profile: expert }).parts.time;
    expect(a).toBeCloseTo(b, 5);
  });
});

// ---------------------------------------------------------------------------
// Cook once, eat twice
// ---------------------------------------------------------------------------

describe("batch cooking", () => {
  const rajma = makeRecipe({
    id: "rajma", tags: ["batch_friendly"], mealTypes: ["lunch", "dinner"],
    prepTimeMin: 15, cookTimeMin: 35, ingredients: [ri("rice", 100)],
  });
  const plainLong = makeRecipe({
    id: "plain-long", mealTypes: ["lunch", "dinner"], prepTimeMin: 15, cookTimeMin: 35,
  });
  const quickBf = makeRecipe({ id: "quick-bf", mealTypes: ["breakfast"], prepTimeMin: 5, cookTimeMin: 5 });

  it("recognises a long, reheat-friendly dish", () => {
    expect(isBatchable(rajma)).toBe(true);
    expect(isBatchable(plainLong)).toBe(false);
    const short = makeRecipe({ id: "short", tags: ["batch_friendly"], prepTimeMin: 5, cookTimeMin: 10 });
    expect(isBatchable(short)).toBe(false);
  });

  it("serves a batch lunch again at dinner, as a leftover of that lunch", () => {
    const plan = planFor(makeProfile({ timeAvailability: "high" }), [rajma, quickBf]);
    const lunch = mealAt(plan, 0, "lunch");
    const dinner = mealAt(plan, 0, "dinner");
    expect(lunch?.recipeId).toBe("rajma");
    expect(dinner?.recipeId).toBe("rajma");
    expect(dinner?.leftoverOf).toBe(lunch?.id);
    expect(dinner?.servings).toBe(lunch?.servings);
    expect(lunch?.leftoverOf).toBeUndefined();
    expect(dinner?.status).toBe("planned");
  });

  it("does not make leftovers of a dish without the batch tag", () => {
    const plan = planFor(makeProfile({ timeAvailability: "high" }), [plainLong, quickBf]);
    expect(plan.meals.some((m) => m.leftoverOf)).toBe(false);
  });

  it("never uses a locked meal as a leftover slot", () => {
    const locked = makeMeal({
      id: "locked-dinner", date: WEEK_START, mealType: "dinner", recipeId: "plain-long", locked: true,
    });
    const plan = planFor(makeProfile({ timeAvailability: "high" }), [rajma, plainLong, quickBf], {
      lockedMeals: [locked],
    });
    const dinner = mealAt(plan, 0, "dinner");
    expect(dinner?.id).toBe("locked-dinner");
    expect(dinner?.leftoverOf).toBeUndefined();
  });

  it("makes a rushed lunch a reheated leftover of the dinner before it", () => {
    // Rajma is far better than the alternative, so it is cooked at every
    // opportunity. Without the look-ahead, Tuesday's lunch would spend Tuesday's
    // dinner as its leftover and leave Wednesday's rushed lunch with nothing.
    const strong = { ...rajma, nutritionPerServing: { kcal: 640, proteinG: 45, carbsG: 70, fatG: 18, fiberG: 12 } };
    const weak = { ...plainLong, nutritionPerServing: { kcal: 60, proteinG: 1, carbsG: 10, fatG: 1, fiberG: 1 } };
    const profile = makeProfile({
      timeAvailability: "high",
      timeSchedule: { wed: { lunch: "very_little" } },
    });
    // Monday is locked so rajma has not been used yet and the variety penalty
    // does not steer Tuesday's lunch away from it.
    const lockedMonday = (["lunch", "dinner"] as const).map((mealType) =>
      makeMeal({
        id: `mon-${mealType}`, date: WEEK_START, mealType, recipeId: "plain-long", locked: true,
      }),
    );
    for (let seed = 1; seed <= 6; seed += 1) {
      const plan = planFor(profile, [strong, weak, quickBf], { lockedMeals: lockedMonday }, seed);
      expect(mealAt(plan, 1, "lunch")?.recipeId, "rajma is cooked on Tuesday").toBe("rajma");
      const wedLunch = mealAt(plan, 2, "lunch");
      const tueDinner = mealAt(plan, 1, "dinner");
      expect(wedLunch?.leftoverOf, `seed ${seed}`).toBe(tueDinner?.id);
      expect(wedLunch?.recipeId).toBe(tueDinner?.recipeId);
    }
  });

  it("only ever links a leftover to an earlier meal of the same dish", () => {
    const plan = planFor(makeProfile({ timeAvailability: "high" }), [rajma, plainLong, quickBf]);
    const byId = new Map(plan.meals.map((m) => [m.id, m]));
    const order = (m: PlannedMeal) =>
      `${m.date}|${["breakfast", "lunch", "dinner"].indexOf(m.mealType)}`;
    let links = 0;
    for (const m of plan.meals) {
      if (!m.leftoverOf) continue;
      links += 1;
      const source = byId.get(m.leftoverOf);
      expect(source).toBeDefined();
      expect(source!.recipeId).toBe(m.recipeId);
      expect(order(source!) < order(m)).toBe(true);
    }
    expect(links).toBeGreaterThan(0);
  });
});

describe("sanitizeLeftovers", () => {
  const source = makeMeal({ id: "src", date: WEEK_START, mealType: "lunch", recipeId: "rajma" });
  const good = makeMeal({
    id: "left", date: WEEK_START, mealType: "dinner", recipeId: "rajma", leftoverOf: "src",
  });

  it("keeps a valid link and returns the same array", () => {
    const meals = [source, good];
    expect(sanitizeLeftovers(meals)).toBe(meals);
  });

  const broken: [string, PlannedMeal[]][] = [
    ["the source meal is gone", [good]],
    ["the source changed recipe", [{ ...source, recipeId: "other" }, good]],
    ["the source was skipped", [{ ...source, status: "skipped" }, good]],
    ["the source is eating out", [{ ...source, status: "eating_out" }, good]],
    ["the source comes after the leftover", [{ ...source, mealType: "dinner" }, { ...good, mealType: "lunch" }]],
    ["the leftover points at itself", [source, { ...good, leftoverOf: "left" }]],
  ];

  it.each(broken)("drops the link when %s", (_why, meals) => {
    const leftover = sanitizeLeftovers(meals).find((m) => m.id === "left");
    expect(leftover).toBeDefined();
    expect(leftover!.leftoverOf).toBeUndefined();
  });

  it("keeps the link when the source has already been cooked", () => {
    const meals = [{ ...source, status: "cooked" as const }, good];
    expect(sanitizeLeftovers(meals)[1].leftoverOf).toBe("src");
  });
});

describe("adaptPlan with leftovers", () => {
  const rajma = makeRecipe({ id: "rajma", tags: ["batch_friendly"], prepTimeMin: 15, cookTimeMin: 35 });
  const quick = makeRecipe({ id: "quick", prepTimeMin: 5, cookTimeMin: 5 });
  const ctx = { profile: makeProfile({ timeAvailability: "high" }), recipes: [rajma, quick], pantry: [] };
  const stamp = "2026-09-14T00:00:00.000Z";

  const plan: MealPlan = {
    id: "plan-1", userId: "user-1", weekStart: WEEK_START, generatedBy: "heuristic",
    createdAt: stamp, updatedAt: stamp,
    meals: [
      makeMeal({ id: "src", date: WEEK_START, mealType: "lunch", recipeId: "rajma" }),
      makeMeal({ id: "left", date: WEEK_START, mealType: "dinner", recipeId: "rajma", leftoverOf: "src" }),
    ],
  };

  it("keeps a leftover when the user is short of time, since it only needs reheating", () => {
    const change: ScheduleChange = {
      id: "c1", userId: "user-1", type: "less_time", date: WEEK_START,
      mealType: "dinner", availableMinutes: 10, createdAt: stamp,
    };
    const left = adaptPlan(plan, change, ctx).meals.find((m) => m.id === "left");
    expect(left?.recipeId).toBe("rajma");
    expect(left?.leftoverOf).toBe("src");
  });

  it("turns a leftover back into a normal meal when its source is skipped", () => {
    const change: ScheduleChange = {
      id: "c2", userId: "user-1", type: "skip_meal", date: WEEK_START,
      mealType: "lunch", createdAt: stamp,
    };
    const out = adaptPlan(plan, change, ctx);
    expect(out.meals.find((m) => m.id === "src")).toBeUndefined();
    expect(out.meals.find((m) => m.id === "left")?.leftoverOf).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A cut-loose leftover has to be cooked, so it must fit its slot
// ---------------------------------------------------------------------------

describe("fitMealsToSchedule", () => {
  const long = makeRecipe({ id: "long", prepTimeMin: 15, cookTimeMin: 30 });
  const quick = makeRecipe({ id: "quick", prepTimeMin: 4, cookTimeMin: 4 });
  const profile = makeProfile({
    timeAvailability: "high",
    timeSchedule: { wed: { lunch: "very_little" } },
  });
  const ctx = { profile, recipes: [long, quick], pantry: [], ingredients: INGREDIENTS };
  const stamp = "2026-09-14T00:00:00.000Z";
  const planOf = (meals: PlannedMeal[]): MealPlan => ({
    id: "plan-1", userId: "user-1", weekStart: WEEK_START, generatedBy: "heuristic",
    createdAt: stamp, updatedAt: stamp, meals,
  });
  const wedLunch = (over: Partial<PlannedMeal> = {}) =>
    makeMeal({ id: "wed", date: addDays(WEEK_START, 2), mealType: "lunch", recipeId: "long", ...over });

  it("replaces a dish that is too long for a rushed slot", () => {
    const out = fitMealsToSchedule(planOf([wedLunch()]), ["wed"], ctx);
    expect(out.meals[0].recipeId).toBe("quick");
  });

  it("leaves a dish that already fits", () => {
    const plan = planOf([wedLunch({ recipeId: "quick" })]);
    expect(fitMealsToSchedule(plan, ["wed"], ctx)).toBe(plan);
  });

  it("leaves a slot the schedule does not cap", () => {
    const free = makeMeal({ id: "free", date: addDays(WEEK_START, 3), mealType: "lunch", recipeId: "long" });
    const plan = planOf([free]);
    expect(fitMealsToSchedule(plan, ["free"], ctx)).toBe(plan);
  });

  it("only touches the meals it is asked about", () => {
    const plan = planOf([wedLunch()]);
    expect(fitMealsToSchedule(plan, ["someone-else"], ctx)).toBe(plan);
  });

  it.each([
    ["a locked meal", { locked: true }],
    ["a meal already cooked", { status: "cooked" as const }],
    ["a leftover, which only needs reheating", { leftoverOf: "src" }],
  ])("never changes %s", (_what, over) => {
    const plan = planOf([wedLunch(over)]);
    expect(fitMealsToSchedule(plan, ["wed"], ctx)).toBe(plan);
  });
});
