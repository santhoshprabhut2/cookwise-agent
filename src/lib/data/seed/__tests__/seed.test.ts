import { describe, expect, it } from "vitest";
import type {
  CookingMethod,
  Difficulty,
  DietType,
  Equipment,
  Ingredient,
  IngredientCategory,
  MealType,
  NutrientKey,
  Recipe,
  RecipeTag,
  StorageLocation,
  Unit,
} from "@/lib/types";
import { INGREDIENTS, ingredientById } from "../ingredients";
import { RECIPES, recipeById } from "../recipes";

// ---------------------------------------------------------------------------
// expectations shared with docs/SEED_DATA.md
// ---------------------------------------------------------------------------

/** Ids other files (demo pantry, grocery engine, screens) reference by hand. */
const REQUIRED_INGREDIENT_IDS = [
  "tomato", "onion", "egg", "chicken", "spinach", "milk", "rice", "coconut",
  "green-chilli", "ragi-flour", "curd", "paneer", "potato", "carrot", "capsicum",
  "garlic", "ginger", "coriander-leaves", "curry-leaves", "mustard-seeds",
  "cumin-seeds", "turmeric", "red-chilli-powder", "garam-masala", "salt",
  "sunflower-oil", "ghee", "coconut-oil", "semolina", "wheat-flour", "urad-dal",
  "toor-dal", "moong-dal", "chana-dal", "chickpeas", "basmati-rice", "pasta",
  "bread", "oats", "banana", "lemon", "peas", "beans", "cabbage", "cauliflower",
  "brinjal", "drumstick", "tamarind", "peanuts", "cashews", "fish", "prawns",
  "mint-leaves", "black-pepper", "sugar", "jaggery", "butter", "cheese",
  "soya-chunks", "tofu",
];

/** Ingredients the mockups sell by the piece. */
const PIECE_INGREDIENT_IDS = [
  "egg", "onion", "tomato", "lemon", "banana", "coconut", "green-chilli",
  "potato", "capsicum",
];

/** Recipes the mockups show, with the exact kcal per serving they print. */
const MOCKUP_KCAL: Record<string, number> = {
  "egg-bhurji": 320,
  "ragi-dosa": 450,
  "chicken-biryani": 620,
  "tomato-egg-curry": 380,
  "spinach-chicken-stir-fry": 420,
  "veg-upma": 310,
  "tomato-pasta": 400,
};

/**
 * Egg Bhurji's ingredient list and its nutrition panel both come straight from
 * the mockup (4 eggs, but 320 kcal / 24 g protein per serving). The panel is
 * therefore ~30 % richer than the ingredients compute to. Every other recipe is
 * computed from the catalog, so only this one is exempt from the check below.
 */
// Egg Bhurji was re-derived from 6 eggs during integration, so nothing is pinned now.
const NUTRITION_PINNED_TO_MOCKUP = new Set<string>([]);

const CATEGORIES: IngredientCategory[] = [
  "vegetables", "fruits", "proteins", "grains", "dairy", "legumes", "spices",
  "oils", "nuts", "other",
];
const UNITS: Unit[] = ["g", "ml", "pcs"];
const STORAGE: StorageLocation[] = ["fridge", "freezer", "pantry"];
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const DIETS: DietType[] = [
  "vegetarian", "non_vegetarian", "vegan", "eggetarian", "pescatarian",
];
const EQUIPMENT: Equipment[] = [
  "stove", "oven", "microwave", "pressure_cooker", "mixer", "blender",
  "air_fryer", "frying_pan", "kadai", "dosa_pan", "tawa", "steamer",
  "rice_cooker", "sensor_dock",
];
const TAGS: RecipeTag[] = [
  "high_protein", "quick", "low_cal", "high_fiber", "budget", "comfort",
  "one_pot", "kid_friendly", "guest_friendly", "batch_friendly", "complete_meal", "staple",
];
const METHODS: CookingMethod[] = [
  "raw", "boil", "steam", "saute", "stir_fry", "shallow_fry", "deep_fry",
  "bake", "roast", "grill", "pressure_cook", "simmer", "microwave",
];
const MACRO_KEYS: NutrientKey[] = ["kcal", "proteinG", "carbsG", "fatG", "fiberG"];

/** Plausible pan-temperature window per cooking method. */
const TEMP_WINDOW: Partial<Record<CookingMethod, [number, number]>> = {
  boil: [95, 105],
  steam: [95, 105],
  simmer: [85, 105],
  saute: [100, 180],
  stir_fry: [150, 210],
  shallow_fry: [145, 200],
  deep_fry: [165, 195],
  bake: [150, 210],
  roast: [150, 230],
  grill: [170, 240],
  pressure_cook: [110, 125],
  microwave: [80, 120],
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Nutrition of one serving computed straight from the ingredient catalog. */
function computePerServing(recipe: Recipe): Record<string, number> {
  const total: Record<string, number> = {};
  for (const ri of recipe.ingredients) {
    const ing = ingredientById(ri.ingredientId) as Ingredient;
    for (const [key, value] of Object.entries(ing.nutrition)) {
      if (typeof value === "number") {
        total[key] = (total[key] ?? 0) + (value * ri.grams) / 100;
      }
    }
  }
  for (const key of Object.keys(total)) total[key] /= recipe.servings;
  return total;
}

function computedCostPerServing(recipe: Recipe): number {
  const total = recipe.ingredients.reduce((sum, ri) => {
    const ing = ingredientById(ri.ingredientId) as Ingredient;
    return sum + (ri.grams / 1000) * ing.costPerKg;
  }, 0);
  return total / recipe.servings;
}

// ---------------------------------------------------------------------------

describe("ingredient catalog", () => {
  it("has a usable number of entries and a working lookup", () => {
    expect(INGREDIENTS.length).toBeGreaterThanOrEqual(55);
    expect(ingredientById("tomato")?.name).toBe("Tomato");
    expect(ingredientById("does-not-exist")).toBeUndefined();
  });

  it("uses unique kebab-case ids", () => {
    const ids = INGREDIENTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, `${id} is not a slug`).toMatch(SLUG);
  });

  it("contains every id other modules reference", () => {
    for (const id of REQUIRED_INGREDIENT_IDS) {
      expect(ingredientById(id), `missing ingredient ${id}`).toBeDefined();
    }
  });

  it("uses only valid enum values", () => {
    for (const i of INGREDIENTS) {
      expect(CATEGORIES, i.id).toContain(i.category);
      expect(UNITS, i.id).toContain(i.defaultUnit);
      expect(STORAGE, i.id).toContain(i.storage);
      expect(i.name.length, i.id).toBeGreaterThan(0);
      expect(i.emoji.length, i.id).toBeGreaterThan(0);
      expect(Array.isArray(i.aliases), i.id).toBe(true);
    }
  });

  it("gives every piece-based ingredient a gramsPerPiece", () => {
    for (const i of INGREDIENTS) {
      if (i.defaultUnit === "pcs") {
        expect(i.gramsPerPiece, `${i.id} has no gramsPerPiece`).toBeDefined();
        expect(i.gramsPerPiece!, i.id).toBeGreaterThan(0);
      }
    }
    for (const id of PIECE_INGREDIENT_IDS) {
      expect(ingredientById(id)!.defaultUnit, `${id} should be sold by piece`).toBe("pcs");
    }
  });

  it("has realistic shelf life, cost and nutrition", () => {
    for (const i of INGREDIENTS) {
      expect(i.shelfLifeDays, i.id).toBeGreaterThan(0);
      expect(i.costPerKg, i.id).toBeGreaterThan(0);
      for (const key of MACRO_KEYS) {
        const v = i.nutrition[key];
        expect(typeof v, `${i.id}.${key}`).toBe("number");
        expect(v!, `${i.id}.${key}`).toBeGreaterThanOrEqual(0);
      }
      // nothing is denser than pure fat
      expect(i.nutrition.kcal, i.id).toBeLessThanOrEqual(950);
      expect(i.nutrition.fatG, i.id).toBeLessThanOrEqual(100);
      expect(i.nutrition.proteinG + i.nutrition.carbsG + i.nutrition.fatG, i.id).toBeLessThanOrEqual(105);
    }
  });

  it("matches the mockup's pantry expectations", () => {
    expect(ingredientById("tomato")!.shelfLifeDays).toBe(5);
    expect(ingredientById("spinach")!.shelfLifeDays).toBe(3);
    expect(ingredientById("milk")!.shelfLifeDays).toBe(4);
    expect(ingredientById("egg")!.shelfLifeDays).toBe(21);
    expect(ingredientById("chicken")!.shelfLifeDays).toBe(2);
    expect(ingredientById("chicken")!.storage).toBe("fridge");
    expect(ingredientById("rice")!.shelfLifeDays).toBeGreaterThan(30);
  });
});

describe("recipe catalog", () => {
  it("has a usable number of entries and a working lookup", () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(26);
    expect(recipeById("egg-bhurji")?.name).toBe("Egg Bhurji");
    expect(recipeById("does-not-exist")).toBeUndefined();
  });

  it("uses unique kebab-case ids and valid enum values", () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RECIPES) {
      expect(r.id).toMatch(SLUG);
      expect(r.description.length, r.id).toBeGreaterThan(0);
      expect(r.emoji.length, r.id).toBeGreaterThan(0);
      expect(r.servings, r.id).toBeGreaterThan(0);
      expect(r.prepTimeMin + r.cookTimeMin, r.id).toBeGreaterThan(0);
      expect(DIFFICULTIES, r.id).toContain(r.difficulty);
      expect(METHODS, r.id).toContain(r.primaryMethod);
      expect(r.spiceLevel, r.id).toBeGreaterThanOrEqual(1);
      expect(r.spiceLevel, r.id).toBeLessThanOrEqual(5);
      expect(r.mealTypes.length, r.id).toBeGreaterThan(0);
      for (const m of r.mealTypes) expect(MEAL_TYPES, r.id).toContain(m);
      for (const d of r.diets) expect(DIETS, r.id).toContain(d);
      for (const e of r.equipment) expect(EQUIPMENT, r.id).toContain(e);
      for (const t of r.tags) expect(TAGS, r.id).toContain(t);
      expect(r.isPublic, r.id).toBe(true);
      expect(r.imageUrl, r.id).toBeUndefined();
    }
  });

  it("references only catalog ingredients, with positive grams", () => {
    for (const r of RECIPES) {
      expect(r.ingredients.length, r.id).toBeGreaterThan(0);
      for (const ri of r.ingredients) {
        const ing = ingredientById(ri.ingredientId);
        expect(ing, `${r.id} -> unknown ingredient ${ri.ingredientId}`).toBeDefined();
        expect(ri.grams, `${r.id}/${ri.ingredientId}`).toBeGreaterThan(0);
        expect(ri.quantity, `${r.id}/${ri.ingredientId}`).toBeGreaterThan(0);
        expect(ri.name, `${r.id}/${ri.ingredientId}`).toBe(ing!.name);
      }
      const ids = r.ingredients.map((ri) => ri.ingredientId);
      expect(new Set(ids).size, `${r.id} lists an ingredient twice`).toBe(ids.length);
    }
  });

  it("uses the catalog unit or a sensible alternative", () => {
    for (const r of RECIPES) {
      for (const ri of r.ingredients) {
        const ing = ingredientById(ri.ingredientId)!;
        const def = ing.defaultUnit;
        const ok =
          ri.unit === def ||
          // a piece-sold item can be weighed out (grated coconut, 50 g onion)
          (def === "pcs" && ri.unit === "g") ||
          // a liquid can be weighed instead of measured
          (def === "ml" && ri.unit === "g");
        expect(ok, `${r.id}/${ri.ingredientId}: unit ${ri.unit} vs default ${def}`).toBe(true);

        if (ri.unit === "pcs") {
          const per = ing.gramsPerPiece;
          expect(per, `${r.id}/${ri.ingredientId} uses pcs without gramsPerPiece`).toBeDefined();
          const expected = ri.quantity * per!;
          expect(
            Math.abs(expected - ri.grams),
            `${r.id}/${ri.ingredientId}: ${ri.quantity} pcs = ${expected} g but grams is ${ri.grams}`,
          ).toBeLessThanOrEqual(Math.max(5, ri.grams * 0.12));
        }
      }
    }
  });

  it("has 4-8 steps numbered 1..n with unique ids", () => {
    for (const r of RECIPES) {
      // A complete meal has the steps of every dish on the plate.
      const most = r.tags.includes("complete_meal") ? 20 : 8;
      expect(r.steps.length, r.id).toBeGreaterThanOrEqual(4);
      expect(r.steps.length, r.id).toBeLessThanOrEqual(most);
      r.steps.forEach((s, idx) => {
        expect(s.order, `${r.id} step ${idx}`).toBe(idx + 1);
        expect(s.id, `${r.id} step ${idx}`).toBe(`${r.id}-s${idx + 1}`);
        expect(s.title.length, s.id).toBeGreaterThan(0);
        expect(s.instruction.length, s.id).toBeGreaterThan(0);
      });
      const ids = r.steps.map((s) => s.id);
      expect(new Set(ids).size, r.id).toBe(ids.length);
    }
  });

  it("adds every ingredient across the steps, matching grams within 5 g", () => {
    for (const r of RECIPES) {
      const added = new Map<string, number>();
      for (const s of r.steps) {
        for (const a of s.addIngredients ?? []) {
          expect(
            r.ingredients.some((ri) => ri.ingredientId === a.ingredientId),
            `${s.id} adds ${a.ingredientId} which is not in the ingredient list`,
          ).toBe(true);
          expect(a.grams, `${s.id}/${a.ingredientId}`).toBeGreaterThan(0);
          added.set(a.ingredientId, (added.get(a.ingredientId) ?? 0) + a.grams);
        }
      }
      for (const ri of r.ingredients) {
        const sum = added.get(ri.ingredientId) ?? 0;
        expect(
          Math.abs(sum - ri.grams),
          `${r.id}/${ri.ingredientId}: steps add ${sum} g, recipe needs ${ri.grams} g`,
        ).toBeLessThanOrEqual(5);
      }
    }
  });

  it("gives heat steps a method, a positive duration and a sane temperature", () => {
    for (const r of RECIPES) {
      for (const s of r.steps) {
        if (s.durationSec !== undefined) {
          expect(s.durationSec, s.id).toBeGreaterThan(0);
        }
        if (s.method !== undefined) {
          expect(METHODS, s.id).toContain(s.method);
          expect(s.durationSec, `${s.id} has a method but no duration`).toBeGreaterThan(0);
        }
        if (s.targetTempC) {
          const { min, max } = s.targetTempC;
          expect(min, s.id).toBeLessThan(max);
          expect(s.method, `${s.id} has a temperature but no method`).toBeDefined();
          expect(s.method, `${s.id} is raw but has a temperature`).not.toBe("raw");
          const window = TEMP_WINDOW[s.method!];
          if (window) {
            expect(min, `${s.id} ${s.method} min`).toBeGreaterThanOrEqual(window[0]);
            expect(max, `${s.id} ${s.method} max`).toBeLessThanOrEqual(window[1]);
          }
        } else if (s.method && s.method !== "raw") {
          throw new Error(`${s.id} cooks with ${s.method} but has no targetTempC`);
        }
      }
      // at least one visual checkpoint per recipe for the cooking screen
      expect(r.steps.some((s) => !!s.stateCue), `${r.id} has no stateCue`).toBe(true);
    }
  });

  it("shows the exact kcal the mockups print", () => {
    for (const [id, kcal] of Object.entries(MOCKUP_KCAL)) {
      const r = recipeById(id);
      expect(r, `missing mockup recipe ${id}`).toBeDefined();
      expect(Math.abs(r!.nutritionPerServing.kcal - kcal), id).toBeLessThanOrEqual(5);
    }
    // Derived from 6 eggs / 2 servings (see docs/SEED_DATA.md "Known deviations").
    const bhurji = recipeById("egg-bhurji")!;
    expect(bhurji.nutritionPerServing.proteinG).toBeCloseTo(20.4, 1);
    expect(bhurji.nutritionPerServing.carbsG).toBeCloseTo(9.4, 1);
    expect(bhurji.nutritionPerServing.fatG).toBeCloseTo(21.8, 1);
    expect(bhurji.nutritionPerServing.fiberG).toBeCloseTo(2, 1);
    expect(bhurji.steps).toHaveLength(6);
    const step2 = bhurji.steps[1];
    expect(step2.title).toBe("Add onions and cook");
    expect(step2.method).toBe("saute");
    expect(step2.durationSec).toBe(240);
    expect(step2.targetTempC).toEqual({ min: 120, max: 150 });
    expect(step2.addIngredients).toEqual([{ ingredientId: "onion", grams: 100 }]);
    expect(step2.stateCue).toBe("onions golden brown");
  });

  it("keeps kcal consistent with the macros (Atwater, within 25 %)", () => {
    for (const r of RECIPES) {
      const n = r.nutritionPerServing;
      const atwater = 4 * n.proteinG + 4 * n.carbsG + 9 * n.fatG;
      const deviation = Math.abs(atwater - n.kcal) / n.kcal;
      expect(
        deviation,
        `${r.id}: ${Math.round(atwater)} kcal from macros vs ${n.kcal} listed`,
      ).toBeLessThanOrEqual(0.25);
      for (const key of MACRO_KEYS) {
        expect(typeof n[key], `${r.id}.${key}`).toBe("number");
        expect(n[key]!, `${r.id}.${key}`).toBeGreaterThanOrEqual(0);
      }
      expect(n.kcal, r.id).toBeGreaterThan(50);
    }
  });

  it("keeps nutritionPerServing close to the ingredients it is made of", () => {
    for (const r of RECIPES) {
      if (NUTRITION_PINNED_TO_MOCKUP.has(r.id)) continue;
      const computed = computePerServing(r);
      const deviation = Math.abs(computed.kcal - r.nutritionPerServing.kcal) / computed.kcal;
      expect(
        deviation,
        `${r.id}: ingredients give ${Math.round(computed.kcal)} kcal, recipe lists ${r.nutritionPerServing.kcal}`,
      ).toBeLessThanOrEqual(0.15);
    }
  });

  it("keeps costPerServing in line with the ingredient costs", () => {
    for (const r of RECIPES) {
      const computed = computedCostPerServing(r);
      expect(r.costPerServing, r.id).toBeGreaterThan(0);
      expect(r.costPerServing, `${r.id}: computed ₹${computed.toFixed(0)}`).toBeLessThanOrEqual(computed * 2.5 + 2);
      expect(r.costPerServing, `${r.id}: computed ₹${computed.toFixed(0)}`).toBeGreaterThanOrEqual(computed * 0.5 - 2);
    }
  });

  it("marks egg, fish and meat recipes with compatible diets only", () => {
    const meat = new Set(["chicken"]);
    const seafood = new Set(["fish", "prawns"]);
    const animal = new Set(["milk", "curd", "paneer", "ghee", "butter", "cheese", "honey"]);
    for (const r of RECIPES) {
      const ids = new Set(r.ingredients.map((ri) => ri.ingredientId));
      const hasMeat = [...meat].some((i) => ids.has(i));
      const hasSeafood = [...seafood].some((i) => ids.has(i));
      const hasEgg = ids.has("egg");
      const hasAnimalProduct = [...animal].some((i) => ids.has(i));

      if (hasMeat) expect(r.diets, r.id).toEqual(["non_vegetarian"]);
      if (hasSeafood && !hasMeat) {
        expect(r.diets, r.id).toContain("pescatarian");
        expect(r.diets, r.id).not.toContain("vegetarian");
      }
      if (hasEgg && !hasMeat && !hasSeafood) {
        expect(r.diets, r.id).toContain("eggetarian");
        expect(r.diets, r.id).not.toContain("vegetarian");
      }
      if (r.diets.includes("vegan")) {
        expect(hasMeat || hasSeafood || hasEgg || hasAnimalProduct, `${r.id} is not vegan`).toBe(false);
        expect(r.diets, r.id).toContain("vegetarian");
      }
    }
  });

  it("covers the planner's variety needs", () => {
    const totalTime = (r: Recipe) => r.prepTimeMin + r.cookTimeMin;
    expect(RECIPES.filter((r) => totalTime(r) <= 15).length).toBeGreaterThanOrEqual(3);
    expect(RECIPES.filter((r) => r.tags.includes("guest_friendly")).length).toBeGreaterThanOrEqual(3);
    expect(RECIPES.filter((r) => r.tags.includes("high_protein")).length).toBeGreaterThanOrEqual(5);
    expect(RECIPES.filter((r) => r.diets.includes("vegan")).length).toBeGreaterThanOrEqual(5);
    expect(RECIPES.filter((r) => r.mealTypes.includes("snack")).length).toBeGreaterThanOrEqual(3);
    expect(RECIPES.filter((r) => r.mealTypes.includes("breakfast")).length).toBeGreaterThanOrEqual(4);

    // the retention engine keys off primaryMethod, so the catalog must exercise it
    const methods = new Set(RECIPES.map((r) => r.primaryMethod));
    for (const m of ["raw", "boil", "steam", "saute", "stir_fry", "simmer", "pressure_cook"] as CookingMethod[]) {
      expect(methods, `no recipe uses ${m}`).toContain(m);
    }
    expect(methods.size).toBeGreaterThanOrEqual(8);

    const costs = RECIPES.map((r) => r.costPerServing);
    expect(Math.min(...costs)).toBeLessThanOrEqual(20);
    expect(Math.max(...costs)).toBeGreaterThanOrEqual(60);

    const spice = new Set(RECIPES.map((r) => r.spiceLevel));
    expect(spice.size).toBeGreaterThanOrEqual(3);
  });

  it("lets the demo pantry cover the mockup's dinner", () => {
    const pantry = ["tomato", "onion", "egg", "chicken", "spinach", "milk", "rice", "coconut"];
    for (const id of pantry) expect(ingredientById(id), id).toBeDefined();
    const bhurji = recipeById("egg-bhurji")!;
    const covered = bhurji.ingredients.filter((ri) => pantry.includes(ri.ingredientId));
    expect(covered.map((ri) => ri.ingredientId)).toEqual(
      expect.arrayContaining(["egg", "onion", "tomato"]),
    );
  });
});
