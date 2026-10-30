/**
 * Demo seeding orchestration.
 *
 * `ensureSeeded()` runs once per browser (guarded by the `seed:v1` kv flag) after
 * every persisted store has rehydrated. It creates Santhosh's profile, the
 * mockup pantry, the current week's plan (with today's meals forced to match the
 * mockup) and the matching grocery list.
 */

import { daysBetween } from "@/lib/engines/helpers";
import { slotTimeLimit, totalMinutes } from "@/lib/engines/planner";
import type {
  CookSession,
  ID,
  IngredientLog,
  ISODate,
  MealType,
  Recipe,
  UserProfile,
} from "@/lib/types";
import { addDays, nowIso, toISODate, uid, weekStartOf } from "@/lib/utils";
import { kvClear, kvGet, kvSet } from "../db";
import { markSeedComplete, waitForStoresHydrated } from "../storage";
import {
  MAX_SESSIONS,
  useCookStore,
  useFeedbackStore,
  useGroceryStore,
  usePantryStore,
  usePlanStore,
  usePreferenceStore,
  useProfileStore,
  useRecipeStore,
} from "../stores";
import {
  DEMO_PANTRY,
  DEMO_TODAY_MEALS,
  createDemoProfile,
} from "./demoUser";

export { INGREDIENTS, ingredientById } from "./ingredients";
export { RECIPES, recipeById } from "./recipes";
export {
  DEMO_PANTRY,
  DEMO_TODAY_MEALS,
  DEMO_USER_ID,
  createDemoProfile,
  createEmptyProfile,
} from "./demoUser";

/** Bump the suffix to force a re-seed after a breaking demo-data change. */
export const SEED_FLAG_KEY = "seed:v1";

/** Meals the seeder marks as already cooked today (so Home shows dinner). */
const ALREADY_COOKED: MealType[] = ["breakfast", "lunch"];
/** Rough local clock times used for the seeded "already cooked" sessions. */
const COOKED_AT_HOUR: Partial<Record<MealType, number>> = {
  breakfast: 8,
  lunch: 13,
};

function isoAtHour(date: string, hour: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------

function seedProfile(): void {
  if (!useProfileStore.getState().profile) {
    useProfileStore.getState().setProfile(createDemoProfile());
  }
}

function seedPantry(): void {
  const pantry = usePantryStore.getState();
  if (pantry.items.length > 0) return;
  const today = toISODate();
  pantry.addMany(
    DEMO_PANTRY.map((row) => ({
      ingredientId: row.ingredientId,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      expiresAt: addDays(today, row.expiresInDays),
      source: row.source,
    })),
  );
}

/**
 * Whether `recipe` can be cooked in the time the profile's weekly schedule
 * allows for that meal. A profile without a schedule never rules a recipe out.
 */
function fitsSchedule(
  profile: UserProfile | null,
  recipe: Recipe,
  date: ISODate,
  mealType: MealType,
): boolean {
  if (!profile?.timeSchedule) return true;
  const dayIndex = Math.min(6, Math.max(0, daysBetween(weekStartOf(date), date)));
  return totalMinutes(recipe) <= slotTimeLimit(profile, { date, mealType, dayIndex });
}

/**
 * Force today's breakfast / lunch / dinner to the mockup recipes when those
 * catalog entries exist, then mark breakfast + lunch cooked so the Home screen
 * surfaces Egg Bhurji as "the next uncooked meal".
 *
 * A mockup dish is only forced where it fits the demo profile's own weekly
 * time schedule: a 40 minute biryani must not appear on a day that says "very
 * little time". The planner's own pick stays in that slot instead.
 */
function forceTodaysMeals(planId: ID): void {
  const today = toISODate();
  const recipes = useRecipeStore.getState();
  const profile = useProfileStore.getState().profile;
  const servings = profile?.servingsDefault ?? 2;

  for (const [mealType, recipeId] of Object.entries(DEMO_TODAY_MEALS) as [
    MealType,
    string,
  ][]) {
    const mockup = recipes.byId(recipeId);
    if (!mockup) continue;
    if (!fitsSchedule(profile, mockup, today, mealType)) continue;
    const plan = usePlanStore.getState().planById(planId);
    if (!plan) return;
    const existing = plan.meals.find(
      (m) => m.date === today && m.mealType === mealType,
    );
    if (existing) {
      if (existing.recipeId !== recipeId) {
        usePlanStore
          .getState()
          .updateMeal(existing.id, { recipeId, status: "planned" });
      }
    } else {
      usePlanStore
        .getState()
        .addMeal(planId, today, mealType, recipeId, servings);
    }
  }

  const plan = usePlanStore.getState().planById(planId);
  if (!plan) return;
  for (const m of plan.meals) {
    if (m.date !== today) continue;
    if (!ALREADY_COOKED.includes(m.mealType)) continue;
    if (!recipes.byId(m.recipeId)) continue;
    usePlanStore.getState().setStatus(m.id, "cooked");
  }
}

/**
 * Create completed cook sessions for the meals marked cooked today so the Home
 * screen's calorie ring and the "expiring items used" stat have data.
 *
 * These sessions are written directly (not through `start()`/`complete()`) with
 * `pantryDeducted: true` so the seeded pantry keeps exactly the mockup
 * quantities.
 */
function seedCookedSessions(planId: ID): void {
  const plan = usePlanStore.getState().planById(planId);
  if (!plan) return;
  const today = toISODate();
  const userId = useProfileStore.getState().userId();
  const recipes = useRecipeStore.getState();
  const existing = useCookStore.getState().sessions;

  const created: CookSession[] = [];
  for (const meal of plan.meals) {
    if (meal.date !== today || meal.status !== "cooked") continue;
    if (existing.some((s) => s.plannedMealId === meal.id)) continue;
    const recipe = recipes.byId(meal.recipeId);
    if (!recipe) continue;

    const factor =
      recipe.servings > 0 ? meal.servings / recipe.servings : 1;
    const hour = COOKED_AT_HOUR[meal.mealType] ?? 12;
    const startedAt = isoAtHour(today, hour);
    const completedAt = isoAtHour(
      today,
      hour + Math.max(1, Math.round((recipe.prepTimeMin + recipe.cookTimeMin) / 60)),
    );
    const ingredientLogs: IngredientLog[] = recipe.ingredients.map((ri) => ({
      ingredientId: ri.ingredientId,
      targetGrams: Math.round(ri.grams * factor),
      actualGrams: Math.round(ri.grams * factor),
      verifiedBy: "manual",
      ts: startedAt,
    }));

    created.push({
      id: uid(),
      userId,
      recipeId: recipe.id,
      plannedMealId: meal.id,
      servings: meal.servings,
      status: "completed",
      startedAt,
      completedAt,
      ingredientLogs,
      stepLogs: [],
      temperatureHistory: [],
      pantryDeducted: true,
    });
  }

  if (created.length) {
    useCookStore.setState({
      sessions: [...existing, ...created].slice(-MAX_SESSIONS),
    });
  }
}

/**
 * Plan the week around today's mockup meals instead of pinning them afterwards.
 * They go in as locked meals, so the planner counts their cost against the
 * budget and chooses the other eighteen meals to fit, then they are unlocked
 * again because the mockup shows them as ordinary meals.
 */
async function generateAroundMockupMeals(weekStart: ISODate) {
  const today = toISODate();
  const recipes = useRecipeStore.getState();
  const profile = useProfileStore.getState().profile;
  const servings = profile?.servingsDefault ?? 2;
  const plans = usePlanStore.getState();

  const pinned = (Object.entries(DEMO_TODAY_MEALS) as [MealType, string][])
    .map(([mealType, recipeId]) => ({ mealType, recipe: recipes.byId(recipeId) }))
    .filter(
      (p): p is { mealType: MealType; recipe: Recipe } =>
        p.recipe !== undefined && fitsSchedule(profile, p.recipe, today, p.mealType),
    )
    .map(({ mealType, recipe }) => ({
      id: uid(),
      planId: "seed",
      date: today,
      mealType,
      recipeId: recipe.id,
      servings,
      locked: true,
      status: "planned" as const,
    }));

  if (pinned.length > 0 && profile) {
    const ts = nowIso();
    plans.upsertPlan({
      id: uid(),
      userId: profile.id,
      weekStart,
      meals: pinned,
      generatedBy: "heuristic",
      createdAt: ts,
      updatedAt: ts,
    });
  }

  const plan = await plans.generate(weekStart);
  const pinnedIds = new Set(pinned.map((m) => m.id));
  for (const meal of plan.meals) {
    if (pinnedIds.has(meal.id)) usePlanStore.getState().lockMeal(meal.id, false);
  }
  return usePlanStore.getState().planById(plan.id) ?? plan;
}

async function runSeed(): Promise<void> {
  seedProfile();
  seedPantry();

  const weekStart = weekStartOf(toISODate());
  const plan =
    usePlanStore.getState().currentPlan(weekStart) ??
    (await generateAroundMockupMeals(weekStart));

  forceTodaysMeals(plan.id);
  seedCookedSessions(plan.id);

  useGroceryStore.getState().generateForPlan(plan.id);
}

/**
 * Idempotent demo seeding. Safe to call on every mount; a no-op on the server.
 * Always flips the hydration gate open, even when seeding fails.
 */
export async function ensureSeeded(): Promise<void> {
  if (typeof window === "undefined") {
    markSeedComplete();
    return;
  }
  try {
    await waitForStoresHydrated();
    const flag = await kvGet(SEED_FLAG_KEY);
    if (flag) return;
    await runSeed();
    await kvSet(SEED_FLAG_KEY, nowIso());
  } catch (err) {
    console.warn("[cookwise/seed] demo seeding failed", err);
  } finally {
    markSeedComplete();
  }
}

/** Profile → settings → "Reset demo data": wipe everything and seed again. */
export async function resetDemoData(): Promise<void> {
  try {
    await kvClear();
    useProfileStore.getState().reset();
    usePantryStore.getState().reset();
    usePlanStore.getState().reset();
    useGroceryStore.getState().reset();
    useCookStore.getState().reset();
    useFeedbackStore.getState().reset();
    usePreferenceStore.getState().reset();
    useRecipeStore.getState().reset();

    await runSeed();
    await kvSet(SEED_FLAG_KEY, nowIso());
  } catch (err) {
    console.warn("[cookwise/seed] reset failed", err);
  } finally {
    markSeedComplete();
  }
}
