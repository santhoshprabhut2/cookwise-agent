import { describe, expect, it } from "vitest";
import type { Ingredient } from "@/lib/types";
import {
  freshBuyEveryDays,
  freshBuyLabel,
  freshnessFit,
  planFreshVisits,
} from "../freshness";
import { generateWeekPlan, scoreRecipe } from "../planner";
import { indexIngredients } from "../nutrition";
import { WEEK_START, makeIngredient, makeProfile, makeRecipe, ri } from "./fixtures";

const ing = (id: string, shelfLifeDays: number, over: Partial<Ingredient> = {}) =>
  makeIngredient({ id, shelfLifeDays, ...over });

describe("freshBuyEveryDays", () => {
  it("buys milk daily even though it keeps a few days", () => {
    expect(freshBuyEveryDays(ing("milk", 4, { defaultUnit: "ml" }))).toBe(1);
  });

  it("re-buys coriander every two days", () => {
    expect(freshBuyEveryDays(ing("coriander-leaves", 4))).toBe(2);
  });

  it("re-buys anything that keeps three days or less as often as it keeps", () => {
    expect(freshBuyEveryDays(ing("chicken", 2))).toBe(2);
    expect(freshBuyEveryDays(ing("spinach", 3))).toBe(3);
    expect(freshBuyEveryDays(ing("fish", 1))).toBe(1);
  });

  it("leaves longer-lived items to the weekly shop", () => {
    expect(freshBuyEveryDays(ing("tomato", 5))).toBeUndefined();
    expect(freshBuyEveryDays(ing("rice", 365))).toBeUndefined();
    expect(freshBuyEveryDays(undefined)).toBeUndefined();
  });

  it("words the interval for people", () => {
    expect(freshBuyLabel(1)).toBe("daily");
    expect(freshBuyLabel(2)).toBe("every 2 days");
  });
});

describe("freshnessFit", () => {
  const catalog = indexIngredients([
    ing("broccoli", 5),
    ing("rice", 365),
    ing("milk", 4),
    ing("spinach", 3),
  ]);

  it("is neutral for a recipe with nothing perishable", () => {
    const r = makeRecipe({ id: "plain", ingredients: [ri("rice", 100)] });
    expect(freshnessFit(r, 4, catalog)).toEqual({ score: 50, items: 0 });
  });

  it("ignores items that are re-bought fresh anyway", () => {
    const r = makeRecipe({ id: "milky", ingredients: [ri("milk", 200), ri("spinach", 50)] });
    expect(freshnessFit(r, 6, catalog).items).toBe(0);
  });

  it("scores a perishable highest on day zero and lower every day after", () => {
    const r = makeRecipe({ id: "broc", ingredients: [ri("broccoli", 150)] });
    const scores = [0, 1, 2, 3, 4].map((d) => freshnessFit(r, d, catalog).score);
    expect(scores[0]).toBe(100);
    for (let i = 1; i < scores.length; i += 1) expect(scores[i]).toBeLessThan(scores[i - 1]);
  });

  it("drops steeply once the ingredient is past its shelf life", () => {
    const r = makeRecipe({ id: "broc", ingredients: [ri("broccoli", 150)] });
    expect(freshnessFit(r, 4, catalog).score).toBeGreaterThan(60);
    expect(freshnessFit(r, 6, catalog).score).toBeLessThan(20);
  });
});

describe("planFreshVisits", () => {
  const milk = ing("milk", 4, { defaultUnit: "ml" });

  it("makes one trip per day it is needed for a daily item", () => {
    const visits = planFreshVisits(
      [
        { date: "2026-09-14", grams: 200 },
        { date: "2026-09-16", grams: 200 },
        { date: "2026-09-18", grams: 200 },
      ],
      1,
      milk,
    );
    expect(visits.map((v) => v.date)).toEqual(["2026-09-14", "2026-09-16", "2026-09-18"]);
  });

  it("does not shop on days nothing is needed", () => {
    expect(planFreshVisits([{ date: "2026-09-14", grams: 200 }], 1, milk)).toHaveLength(1);
  });

  it("covers every need inside the interval with one trip", () => {
    const visits = planFreshVisits(
      [
        { date: "2026-09-14", grams: 300 },
        { date: "2026-09-15", grams: 200 },
        { date: "2026-09-17", grams: 100 },
      ],
      2,
      ing("chicken", 2),
    );
    expect(visits).toHaveLength(2);
    expect(visits[0]).toMatchObject({ date: "2026-09-14", grams: 500 });
    expect(visits[1]).toMatchObject({ date: "2026-09-17", grams: 100 });
  });

  it("rounds a small need up to a sensible amount, not a whole pack", () => {
    const [visit] = planFreshVisits([{ date: "2026-09-14", grams: 130 }], 1, milk);
    expect(visit.grams).toBe(150);
    expect(visit.quantity).toBe(150);
  });

  it("buys whole pieces for piece-sold items", () => {
    const egg = ing("egg", 2, { defaultUnit: "pcs", gramsPerPiece: 50 });
    const [visit] = planFreshVisits([{ date: "2026-09-14", grams: 120 }], 2, egg);
    expect(visit.quantity).toBe(3);
    expect(visit.grams).toBe(150);
  });

  it("returns nothing when nothing is needed", () => {
    expect(planFreshVisits([], 1, milk)).toEqual([]);
    expect(planFreshVisits([{ date: "2026-09-14", grams: 0 }], 1, milk)).toEqual([]);
  });
});

describe("early spoilers first, in the planner", () => {
  const catalog = [ing("broccoli", 4), ing("rice", 365)];
  const fresh = makeRecipe({
    id: "fresh-dish", mealTypes: ["dinner"], ingredients: [ri("broccoli", 200)],
  });
  const keeps = makeRecipe({
    id: "keeps-dish", mealTypes: ["dinner"], ingredients: [ri("rice", 200)],
  });
  const ctxFor = (profile = makeProfile()) => ({
    profile,
    ingredientById: indexIngredients(catalog),
    shopDate: WEEK_START,
  });
  const slotOn = (dayIndex: number) => ({
    date: `2026-09-${14 + dayIndex}`,
    mealType: "dinner" as const,
    dayIndex,
  });

  it("rewards a short-lived dish early in the week and penalises it late", () => {
    const early = scoreRecipe(fresh, slotOn(0), ctxFor()).parts.freshness;
    const late = scoreRecipe(fresh, slotOn(5), ctxFor()).parts.freshness;
    expect(early).toBeGreaterThan(0);
    expect(late).toBeLessThan(0);
  });

  it("is neutral for a dish that keeps", () => {
    expect(scoreRecipe(keeps, slotOn(5), ctxFor()).parts.freshness).toBe(0);
  });

  it("has no effect when the catalog is not supplied", () => {
    const parts = scoreRecipe(fresh, slotOn(5), { profile: makeProfile() }).parts;
    expect(parts.freshness).toBe(0);
  });

  it("only cooks the perishable dish while its ingredient is still fresh", () => {
    // Enough alternatives that the variety rule does not force the dish in.
    const profile = makeProfile({ timeAvailability: "high" });
    const alternatives = Array.from({ length: 12 }, (_, k) =>
      makeRecipe({ id: `keeps-${k}`, mealTypes: ["dinner"], ingredients: [ri("rice", 200)] }),
    );
    const dayIndex = (date: string) => Number(date.slice(-2)) - Number(WEEK_START.slice(-2));
    let uses = 0;
    for (let seed = 1; seed <= 10; seed += 1) {
      const plan = generateWeekPlan(
        { profile, weekStart: WEEK_START, pantry: [] },
        [fresh, ...alternatives],
        { ingredients: catalog, today: WEEK_START, seed },
      );
      for (const m of plan.meals.filter((x) => x.recipeId === "fresh-dish")) {
        uses += 1;
        // Broccoli keeps 4 days, so day 3 is the last good day.
        expect(dayIndex(m.date), `seed ${seed}`).toBeLessThanOrEqual(3);
      }
    }
    expect(uses).toBeGreaterThan(0);
  });
});
