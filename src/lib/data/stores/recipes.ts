"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isCompleteMeal } from "@/lib/engines/meals";
import type { DietType, ID, MealType, Recipe, RecipeTag } from "@/lib/types";
import { RECIPES } from "../seed/recipes";
import { persistConfig, trackHydration } from "../storage";

export const RECIPE_STORE_KEY = "cookwise:recipes";

export interface RecipeFilters {
  mealType?: MealType;
  tag?: RecipeTag;
  /** prep + cook time upper bound. */
  maxMinutes?: number;
  diet?: DietType;
  /** Only whole plates: a main dish with its rice, chapati or other staple. */
  complete?: boolean;
  /** Only foods the user added themselves. */
  custom?: boolean;
}

export interface RecipeState {
  recipes: Recipe[];
  byId(id: ID): Recipe | undefined;
  search(q: string, filters?: RecipeFilters): Recipe[];
  upsert(r: Recipe): void;
  remove(id: ID): void;
  /** Catalog only (`isPublic`), e.g. for the "All recipes" list. */
  catalog(): Recipe[];
  reset(): void;
}

/** Only user-created / AI-generated recipes are persisted. */
type RecipePersisted = { recipes: Recipe[] };

export function totalTimeMin(r: Recipe): number {
  return r.prepTimeMin + r.cookTimeMin;
}

function matchesQuery(r: Recipe, term: string): boolean {
  if (!term) return true;
  return (
    r.name.toLowerCase().includes(term) ||
    r.description.toLowerCase().includes(term) ||
    r.cuisine.toLowerCase().includes(term) ||
    r.tags.some((t) => t.replace(/_/g, " ").includes(term)) ||
    r.ingredients.some((i) => i.name.toLowerCase().includes(term))
  );
}

export const useRecipeStore = create<RecipeState>()(
  persist<RecipeState, [], [], RecipePersisted>(
    (set, get) => ({
      recipes: [...RECIPES],

      byId(id) {
        return get().recipes.find((r) => r.id === id);
      },

      search(q, filters) {
        const term = q.trim().toLowerCase();
        const f = filters ?? {};
        return get().recipes.filter((r) => {
          if (!matchesQuery(r, term)) return false;
          if (f.mealType && !r.mealTypes.includes(f.mealType)) return false;
          if (f.tag && !r.tags.includes(f.tag)) return false;
          if (f.maxMinutes !== undefined && totalTimeMin(r) > f.maxMinutes) {
            return false;
          }
          if (f.diet && !r.diets.includes(f.diet)) return false;
          if (f.complete && !isCompleteMeal(r)) return false;
          if (f.custom && r.isPublic) return false;
          return true;
        });
      },

      upsert(r) {
        const next = [...get().recipes];
        const i = next.findIndex((x) => x.id === r.id);
        if (i >= 0) next[i] = r;
        else next.push(r);
        set({ recipes: next });
      },

      remove(id) {
        set({ recipes: get().recipes.filter((r) => r.id !== id) });
      },

      catalog() {
        return get().recipes.filter((r) => r.isPublic);
      },

      reset() {
        set({ recipes: [...RECIPES] });
      },
    }),
    persistConfig<RecipeState, RecipePersisted>(RECIPE_STORE_KEY, {
      // Ship catalog updates with the app: persist user recipes only.
      partialize: (s) => ({ recipes: s.recipes.filter((r) => !r.isPublic) }),
      merge: (persisted, current) => {
        const saved = (persisted as RecipePersisted | undefined)?.recipes ?? [];
        const map = new Map(current.recipes.map((r) => [r.id, r]));
        for (const r of saved) map.set(r.id, r);
        return { ...current, recipes: [...map.values()] };
      },
    }),
  ),
);

trackHydration(RECIPE_STORE_KEY, useRecipeStore);
