import { describe, expect, it } from "vitest";
import { RECIPES } from "@/lib/data/seed/recipes";
import type { MealPlan, Recipe } from "@/lib/types";
import { PLATE_FILTERS, filterPlates, foodKindLabel, upcomingUses } from "../filters";

const byId = (id: string) => RECIPES.find((r) => r.id === id) as Recipe;

describe("filterPlates", () => {
  it("lists only whole plates, never a bare curry or a staple", () => {
    const all = filterPlates(RECIPES, "all");
    const ids = all.map((r) => r.id);
    expect(ids).toContain("rajma-chawal");
    expect(ids).not.toContain("steamed-rice");
    expect(ids).not.toContain("chapati");
    expect(ids).not.toContain("chana-masala");
  });

  it("is about lunch and dinner, so breakfast-only foods are left out", () => {
    const all = filterPlates(RECIPES, "all");
    expect(all.every((r) => r.mealTypes.includes("lunch") || r.mealTypes.includes("dinner"))).toBe(
      true,
    );
    expect(all.map((r) => r.id)).not.toContain("banana-oat-smoothie");
  });

  it("separates rice plates from chapati plates", () => {
    const rice = filterPlates(RECIPES, "rice").map((r) => r.id);
    const chapati = filterPlates(RECIPES, "chapati").map((r) => r.id);
    expect(rice).toContain("dal-rice");
    expect(rice).not.toContain("chana-masala-chapati");
    expect(chapati).toContain("chana-masala-chapati");
    expect(chapati).not.toContain("dal-rice");
  });

  it("keeps meat and fish out of the vegetarian chip", () => {
    const veg = filterPlates(RECIPES, "veg").map((r) => r.id);
    expect(veg).toContain("soya-curry-chapati");
    expect(veg).not.toContain("chicken-curry-rice");
  });

  it("finds egg, chicken and fish plates", () => {
    expect(filterPlates(RECIPES, "egg").map((r) => r.id)).toContain("egg-curry-rice");
    const meat = filterPlates(RECIPES, "meat_fish").map((r) => r.id);
    expect(meat).toContain("chicken-curry-rice");
    expect(meat).toContain("fish-curry-rice");
  });

  it("gives every chip at least one meal", () => {
    for (const chip of PLATE_FILTERS) {
      expect(filterPlates(RECIPES, chip.key).length, chip.label).toBeGreaterThan(0);
    }
  });
});

describe("foodKindLabel", () => {
  it("names the three kinds", () => {
    expect(foodKindLabel(byId("rajma-chawal"))).toBe("Complete meal");
    expect(foodKindLabel(byId("steamed-rice"))).toBe("Side or staple");
    expect(foodKindLabel(byId("chana-masala"))).toBe("Needs rice or chapati");
  });
});

describe("upcomingUses", () => {
  const plan = (statuses: string[]): MealPlan =>
    ({
      id: "p",
      meals: statuses.map((status, i) => ({
        id: `m${i}`,
        recipeId: "custom-1",
        status,
      })),
    }) as unknown as MealPlan;

  it("counts only meals still ahead", () => {
    const plans = [plan(["planned", "cooked", "skipped", "planned", "eating_out"])];
    expect(upcomingUses(plans, "custom-1")).toEqual(["m0", "m3"]);
  });

  it("ignores other recipes", () => {
    expect(upcomingUses([plan(["planned"])], "other")).toEqual([]);
  });
});
