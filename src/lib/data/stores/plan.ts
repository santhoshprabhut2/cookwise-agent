"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STATIC_EXPORT } from "@/lib/base-path";
import { sanitizeLeftovers } from "@/lib/engines/leftovers";
import {
  adaptPlan,
  fitMealsToSchedule,
  generateWeekPlan,
  type PlannerContext,
} from "@/lib/engines/planner";
import type {
  ID,
  ISODate,
  MealPlan,
  MealPlanRequest,
  MealType,
  PlannedMeal,
  PlannedMealStatus,
  Recipe,
  ScheduleChange,
  UserProfile,
} from "@/lib/types";
import { nowIso, toISODate, uid, weekStartOf } from "@/lib/utils";
import { createDemoProfile } from "../seed/demoUser";
import { INGREDIENTS } from "../seed/ingredients";
import { MEAL_ORDER } from "../selectors";
import { persistConfig, trackHydration } from "../storage";
import { usePantryStore } from "./pantry";
import { usePreferenceStore } from "./preference";
import { useProfileStore } from "./profile";
import { useRecipeStore } from "./recipes";

export const PLAN_STORE_KEY = "cookwise:plans";

/** Canonical meal ordering (defined in the store-free selectors module). */
export { MEAL_ORDER } from "../selectors";

export interface GenerateOptions {
  /** Try `POST /api/ai/meal-plan` first; silently falls back to the heuristic. */
  useAI?: boolean;
  /** Reserved for deterministic planning; currently forwarded to the planner request only. */
  seed?: number;
}

/**
 * Input for `applyChange`. `id` is optional: pass the same id you used for a
 * client-side `adaptPlan` preview so the seeded planner makes identical picks
 * when the change is applied.
 */
export type ScheduleChangeInput = Omit<
  ScheduleChange,
  "id" | "userId" | "createdAt"
> & { id?: ID };

export interface PlanState {
  plans: MealPlan[];
  changes: ScheduleChange[];

  planById(id: ID): MealPlan | undefined;
  currentPlan(weekStart?: ISODate): MealPlan | undefined;
  mealById(mealId: ID): PlannedMeal | undefined;
  planForMeal(mealId: ID): MealPlan | undefined;

  generate(weekStart: ISODate, opts?: GenerateOptions): Promise<MealPlan>;
  upsertPlan(plan: MealPlan): void;

  swapMeal(mealId: ID, recipeId: ID): void;
  lockMeal(mealId: ID, locked: boolean): void;
  updateMeal(mealId: ID, patch: Partial<PlannedMeal>): void;
  addMeal(
    planId: ID,
    date: ISODate,
    mealType: MealType,
    recipeId: ID,
    servings: number,
  ): PlannedMeal | undefined;
  removeMeal(mealId: ID): void;
  setStatus(mealId: ID, status: PlannedMealStatus): void;

  applyChange(change: ScheduleChangeInput): Promise<MealPlan>;
  reset(): void;
}

type PlanPersisted = { plans: MealPlan[]; changes: ScheduleChange[] };

function mealKey(m: Pick<PlannedMeal, "date" | "mealType">): string {
  return `${m.date}|${m.mealType}`;
}

export function sortMeals(meals: PlannedMeal[]): PlannedMeal[] {
  return [...meals].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType),
  );
}

/** Locked meals always survive a regeneration. */
function mergeLocked(
  meals: PlannedMeal[],
  locked: PlannedMeal[],
): PlannedMeal[] {
  if (!locked.length) return sortMeals(meals);
  const map = new Map(meals.map((m) => [mealKey(m), m]));
  for (const m of locked) map.set(mealKey(m), m);
  return sortMeals([...map.values()]);
}

function currentProfile(): UserProfile {
  return useProfileStore.getState().profile ?? createDemoProfile();
}

function plannerContext(profile: UserProfile): PlannerContext {
  return {
    profile,
    recipes: useRecipeStore.getState().recipes,
    pantry: usePantryStore.getState().items,
    preferences: usePreferenceStore.getState().model,
    ingredients: INGREDIENTS,
    today: toISODate(),
  };
}

/**
 * After an edit, cut any leftover link the edit broke. A leftover whose source
 * dish changed is now a meal that has to be cooked, so one that no longer fits
 * its slot's time limit is given a dish that does.
 */
function settleLeftovers(plan: MealPlan, before: PlannedMeal[]): MealPlan {
  const meals = sanitizeLeftovers(plan.meals);
  if (meals === plan.meals) return plan;

  const wereLeftovers = new Set(before.filter((m) => m.leftoverOf).map((m) => m.id));
  const orphaned = meals
    .filter((m) => wereLeftovers.has(m.id) && !m.leftoverOf)
    .map((m) => m.id);
  const cleaned: MealPlan = { ...plan, meals };
  if (orphaned.length === 0) return cleaned;
  try {
    return fitMealsToSchedule(cleaned, orphaned, plannerContext(currentProfile()));
  } catch (err) {
    console.warn("[cookwise/plan] could not re-fit orphaned leftovers", err);
    return cleaned;
  }
}

/** Compact recipe summary sent to the AI route (keeps the payload small). */
function recipeSummary(r: Recipe) {
  return {
    id: r.id,
    name: r.name,
    cuisine: r.cuisine,
    mealTypes: r.mealTypes,
    tags: r.tags,
    diets: r.diets,
    spiceLevel: r.spiceLevel,
    totalTimeMin: r.prepTimeMin + r.cookTimeMin,
    costPerServing: r.costPerServing,
    kcal: r.nutritionPerServing.kcal,
    proteinG: r.nutritionPerServing.proteinG,
  };
}

/**
 * Tiny fetch helper for `POST /api/ai/meal-plan`.
 * Returns `null` for every failure mode (offline, route missing, 503 fallback,
 * malformed body) so the caller can use the deterministic planner.
 */
async function requestAiPlan(
  req: MealPlanRequest,
  recipes: Recipe[],
): Promise<PlannedMeal[] | null> {
  if (STATIC_EXPORT) return null;
  if (typeof window === "undefined" || typeof fetch !== "function") return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  try {
    const res = await fetch("/api/ai/meal-plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...req, recipes: recipes.map(recipeSummary) }),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const meals = (data as { meals?: PlannedMeal[] } | null)?.meals;
    return Array.isArray(meals) && meals.length > 0 ? meals : null;
  } catch (err) {
    console.warn("[cookwise/plan] AI meal plan unavailable, using heuristic", err);
    return null;
  }
}

function normaliseMeals(meals: PlannedMeal[], planId: ID): PlannedMeal[] {
  return sortMeals(meals).map((m) => ({
    ...m,
    id: m.id || uid(),
    planId,
    servings: m.servings > 0 ? m.servings : 1,
    locked: m.locked ?? false,
    status: m.status ?? "planned",
  }));
}

export const usePlanStore = create<PlanState>()(
  persist<PlanState, [], [], PlanPersisted>(
    (set, get) => ({
      plans: [],
      changes: [],

      planById(id) {
        return get().plans.find((p) => p.id === id);
      },

      currentPlan(weekStart) {
        const ws = weekStart ?? weekStartOf(toISODate());
        return get().plans.find((p) => p.weekStart === ws);
      },

      mealById(mealId) {
        for (const p of get().plans) {
          const m = p.meals.find((x) => x.id === mealId);
          if (m) return m;
        }
        return undefined;
      },

      planForMeal(mealId) {
        return get().plans.find((p) => p.meals.some((m) => m.id === mealId));
      },

      async generate(weekStart, opts) {
        const profile = currentProfile();
        const recipes = useRecipeStore.getState().recipes;
        const existing = get().plans.find((p) => p.weekStart === weekStart);
        const lockedMeals = existing
          ? existing.meals.filter((m) => m.locked)
          : [];

        const req: MealPlanRequest = {
          profile,
          weekStart,
          pantry: usePantryStore.getState().items,
          preferences: usePreferenceStore.getState().model,
          lockedMeals,
          changes: get().changes.filter(
            (c) => weekStartOf(c.date) === weekStart,
          ),
        };

        let plan: MealPlan | null = null;
        if (opts?.useAI) {
          const meals = await requestAiPlan(req, recipes);
          if (meals) {
            const ts = nowIso();
            plan = {
              id: uid(),
              userId: profile.id,
              weekStart,
              meals,
              generatedBy: "gemini",
              createdAt: ts,
              updatedAt: ts,
            };
            // The model was asked to respect the weekly time limits; make sure it did.
            try {
              plan = fitMealsToSchedule(
                plan,
                plan.meals.map((m) => m.id),
                plannerContext(profile),
              );
            } catch (err) {
              console.warn("[cookwise/plan] could not check the AI plan against the schedule", err);
            }
          }
        }
        if (!plan) {
          plan = generateWeekPlan(req, recipes, {
            seed: opts?.seed,
            ingredients: INGREDIENTS,
            today: toISODate(),
          });
        }

        const id = existing?.id ?? plan.id;
        const finalPlan: MealPlan = {
          ...plan,
          id,
          userId: profile.id,
          weekStart,
          createdAt: existing?.createdAt ?? plan.createdAt ?? nowIso(),
          updatedAt: nowIso(),
          // Locked meals keep their ids but everything else is new, so a locked
          // leftover can be left pointing at a meal that no longer exists.
          meals: sanitizeLeftovers(
            normaliseMeals(mergeLocked(plan.meals, lockedMeals), id),
          ),
        };

        set({
          plans: [
            ...get().plans.filter((p) => p.weekStart !== weekStart),
            finalPlan,
          ],
        });
        return finalPlan;
      },

      upsertPlan(plan) {
        const next = [...get().plans];
        const i = next.findIndex((p) => p.id === plan.id);
        if (i >= 0) next[i] = plan;
        else next.push(plan);
        set({ plans: next });
      },

      swapMeal(mealId, recipeId) {
        // Servings and lock state are deliberately preserved.
        get().updateMeal(mealId, { recipeId, status: "planned" });
      },

      lockMeal(mealId, locked) {
        get().updateMeal(mealId, { locked });
      },

      updateMeal(mealId, patch) {
        const ts = nowIso();
        set({
          plans: get().plans.map((p) =>
            p.meals.some((m) => m.id === mealId)
              ? // Swapping a dish, or removing the one a leftover was made from,
                // must not leave a leftover pointing at the wrong meal.
                settleLeftovers(
                  {
                    ...p,
                    updatedAt: ts,
                    meals: p.meals.map((m) =>
                      m.id === mealId
                        ? { ...m, ...patch, id: m.id, planId: m.planId }
                        : m,
                    ),
                  },
                  p.meals,
                )
              : p,
          ),
        });
      },

      addMeal(planId, date, mealType, recipeId, servings) {
        const plan = get().plans.find((p) => p.id === planId);
        if (!plan) return undefined;
        const meal: PlannedMeal = {
          id: uid(),
          planId,
          date,
          mealType,
          recipeId,
          servings,
          locked: false,
          status: "planned",
        };
        set({
          plans: get().plans.map((p) =>
            p.id === planId
              ? {
                  ...p,
                  updatedAt: nowIso(),
                  meals: sortMeals([...p.meals, meal]),
                }
              : p,
          ),
        });
        return meal;
      },

      removeMeal(mealId) {
        const ts = nowIso();
        set({
          plans: get().plans.map((p) =>
            p.meals.some((m) => m.id === mealId)
              ? settleLeftovers(
                  {
                    ...p,
                    updatedAt: ts,
                    meals: p.meals.filter((m) => m.id !== mealId),
                  },
                  p.meals,
                )
              : p,
          ),
        });
      },

      setStatus(mealId, status) {
        get().updateMeal(mealId, { status });
      },

      async applyChange(input) {
        const profile = currentProfile();
        const change: ScheduleChange = {
          ...input,
          id: input.id ?? uid(),
          userId: profile.id,
          createdAt: nowIso(),
        };

        const weekStart = weekStartOf(change.date);
        const existing = get().plans.find((p) => p.weekStart === weekStart);
        const base = existing ?? (await get().generate(weekStart));

        let adapted: MealPlan = base;
        try {
          adapted = adaptPlan(base, change, plannerContext(profile));
        } catch (err) {
          console.warn("[cookwise/plan] adaptPlan failed, keeping plan", err);
        }

        const finalPlan: MealPlan = {
          ...adapted,
          id: base.id,
          userId: profile.id,
          weekStart,
          createdAt: base.createdAt,
          updatedAt: nowIso(),
          meals: sanitizeLeftovers(normaliseMeals(adapted.meals, base.id)),
        };

        set({
          changes: [...get().changes, change],
          plans: [...get().plans.filter((p) => p.id !== base.id), finalPlan],
        });
        return finalPlan;
      },

      reset() {
        set({ plans: [], changes: [] });
      },
    }),
    persistConfig<PlanState, PlanPersisted>(PLAN_STORE_KEY, {
      partialize: (s) => ({ plans: s.plans, changes: s.changes }),
    }),
  ),
);

trackHydration(PLAN_STORE_KEY, usePlanStore);
