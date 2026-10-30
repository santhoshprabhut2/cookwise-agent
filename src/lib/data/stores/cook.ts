"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { estimateRetention } from "@/lib/engines/retention";
import type {
  CookSession,
  ID,
  IngredientLog,
  RetentionEstimate,
  StepLog,
  TempSample,
} from "@/lib/types";
import { nowIso, toISODate, uid } from "@/lib/utils";
import { INGREDIENTS } from "../seed/ingredients";
import { persistConfig, trackHydration } from "../storage";
import { usePantryStore } from "./pantry";
import { usePlanStore } from "./plan";
import { useProfileStore } from "./profile";
import { useRecipeStore } from "./recipes";

export const COOK_STORE_KEY = "cookwise:cook";

/** Keep the history bounded so a long session cannot blow up IndexedDB. */
export const MAX_TEMP_SAMPLES = 3000;
/** Only the most recent sessions are kept locally. */
export const MAX_SESSIONS = 50;

export interface CookState {
  sessions: CookSession[];
  activeId: ID | null;

  active(): CookSession | undefined;
  byId(id: ID): CookSession | undefined;
  forRecipe(recipeId: ID): CookSession[];

  start(recipeId: ID, servings: number, plannedMealId?: ID): CookSession;
  resume(sessionId: ID): CookSession | undefined;
  logIngredient(log: IngredientLog): void;
  startStep(stepId: ID): void;
  endStep(stepId: ID, summary?: Partial<StepLog>): void;
  addTemp(sample: TempSample): void;
  setRetention(est: RetentionEstimate): void;
  /** Completes, computes retention, deducts pantry once, marks the meal cooked. */
  complete(): CookSession | undefined;
  /**
   * Log a reheated leftover as eaten. Nothing is cooked or deducted, because the
   * dish was already cooked (and the pantry already charged) for its source
   * meal. The portion still counts towards that day's intake.
   */
  logLeftover(mealId: ID): CookSession | undefined;
  abandon(): void;
  reset(): void;
}

type CookPersisted = { sessions: CookSession[]; activeId: ID | null };

/**
 * Thin the oldest half of the history (keep every other sample) once the cap is
 * exceeded, so recent readings stay dense while old ones degrade gracefully.
 */
export function capTemperatureHistory(history: TempSample[]): TempSample[] {
  if (history.length <= MAX_TEMP_SAMPLES) return history;
  const keep = Math.floor(MAX_TEMP_SAMPLES / 2);
  const recent = history.slice(-keep);
  const older = history
    .slice(0, history.length - keep)
    .filter((_, i) => i % 2 === 0);
  return [...older, ...recent];
}

function msSince(startedAt: string, at: string): number {
  return Date.parse(at) - Date.parse(startedAt);
}

/** Average / max temperature recorded inside a step's time window. */
function tempSummary(
  session: CookSession,
  step: StepLog,
): { avgTempC?: number; maxTempC?: number } {
  if (!step.endedAt || session.temperatureHistory.length === 0) return {};
  const from = msSince(session.startedAt, step.startedAt);
  const to = msSince(session.startedAt, step.endedAt);
  const inWindow = session.temperatureHistory.filter(
    (s) => s.t >= from && s.t <= to,
  );
  if (!inWindow.length) return {};
  const sum = inWindow.reduce((a, s) => a + s.tempC, 0);
  return {
    avgTempC: Math.round((sum / inWindow.length) * 10) / 10,
    maxTempC: Math.max(...inWindow.map((s) => s.tempC)),
  };
}

export const useCookStore = create<CookState>()(
  persist<CookState, [], [], CookPersisted>(
    (set, get) => {
      /** Apply a patch to the active session. */
      const patchActive = (fn: (s: CookSession) => CookSession): void => {
        const { activeId, sessions } = get();
        if (!activeId) return;
        set({
          sessions: sessions.map((s) => (s.id === activeId ? fn(s) : s)),
        });
      };

      return {
        sessions: [],
        activeId: null,

        active() {
          const { activeId, sessions } = get();
          return activeId ? sessions.find((s) => s.id === activeId) : undefined;
        },

        byId(id) {
          return get().sessions.find((s) => s.id === id);
        },

        forRecipe(recipeId) {
          return get().sessions.filter((s) => s.recipeId === recipeId);
        },

        start(recipeId, servings, plannedMealId) {
          // Started from a recipe page without an explicit meal? Link it to
          // today's still-planned meal for the same recipe so finishing the
          // session marks that meal cooked and feeds the daily intake.
          if (!plannedMealId) {
            const today = toISODate();
            const plan = usePlanStore.getState().currentPlan();
            plannedMealId = plan?.meals.find(
              (m) =>
                m.date === today &&
                m.recipeId === recipeId &&
                m.status === "planned",
            )?.id;
          }
          const session: CookSession = {
            id: uid(),
            userId: useProfileStore.getState().userId(),
            recipeId,
            plannedMealId,
            servings: servings > 0 ? servings : 1,
            status: "verifying",
            startedAt: nowIso(),
            ingredientLogs: [],
            stepLogs: [],
            temperatureHistory: [],
            pantryDeducted: false,
          };
          const sessions = [...get().sessions, session].slice(-MAX_SESSIONS);
          set({ sessions, activeId: session.id });
          return session;
        },

        resume(sessionId) {
          const s = get().byId(sessionId);
          if (s) set({ activeId: s.id });
          return s;
        },

        logIngredient(log) {
          patchActive((s) => {
            const logs = [...s.ingredientLogs];
            const i = logs.findIndex(
              (l) => l.ingredientId === log.ingredientId,
            );
            if (i >= 0) logs[i] = log;
            else logs.push(log);
            return { ...s, ingredientLogs: logs };
          });
        },

        startStep(stepId) {
          patchActive((s) => {
            const logs = [...s.stepLogs];
            const i = logs.findIndex((l) => l.stepId === stepId);
            const entry: StepLog = { stepId, startedAt: nowIso() };
            if (i >= 0) logs[i] = entry;
            else logs.push(entry);
            return { ...s, status: "cooking", stepLogs: logs };
          });
        },

        endStep(stepId, summary) {
          patchActive((s) => {
            const i = s.stepLogs.findIndex((l) => l.stepId === stepId);
            if (i < 0) return s;
            const endedAt = summary?.endedAt ?? nowIso();
            const started = s.stepLogs[i];
            const ended: StepLog = {
              ...started,
              endedAt,
              durationSec: Math.max(
                0,
                Math.round(msSince(started.startedAt, endedAt) / 1000),
              ),
            };
            const logs = [...s.stepLogs];
            logs[i] = { ...ended, ...tempSummary(s, ended), ...summary, endedAt };
            return { ...s, stepLogs: logs };
          });
        },

        addTemp(sample) {
          patchActive((s) => ({
            ...s,
            temperatureHistory: capTemperatureHistory([
              ...s.temperatureHistory,
              sample,
            ]),
          }));
        },

        setRetention(est) {
          patchActive((s) => ({ ...s, retention: est }));
        },

        complete() {
          const session = get().active();
          if (!session) return undefined;

          const recipe = useRecipeStore.getState().byId(session.recipeId);
          const completedAt = nowIso();

          let retention = session.retention;
          if (recipe) {
            try {
              retention = estimateRetention({
                recipe,
                ingredients: INGREDIENTS,
                ingredientLogs: session.ingredientLogs,
                stepLogs: session.stepLogs,
                temperatureHistory: session.temperatureHistory,
                servings: session.servings,
              });
            } catch (err) {
              console.warn("[cookwise/cook] retention estimate failed", err);
            }
          }

          // Deduct the pantry exactly once per session.
          if (!session.pantryDeducted && recipe) {
            const factor =
              recipe.servings > 0 ? session.servings / recipe.servings : 1;
            const pantry = usePantryStore.getState();
            for (const ri of recipe.ingredients) {
              const logged = session.ingredientLogs.find(
                (l) => l.ingredientId === ri.ingredientId,
              );
              const grams = logged?.actualGrams ?? ri.grams * factor;
              if (grams > 0) pantry.consume(ri.ingredientId, grams);
            }
          }

          if (session.plannedMealId) {
            try {
              usePlanStore.getState().setStatus(session.plannedMealId, "cooked");
            } catch (err) {
              console.warn("[cookwise/cook] could not mark meal cooked", err);
            }
          }

          // A dish cooked for several meals is cooked (and deducted) once for
          // all of them, but only the cook's own portion is eaten now. Record
          // that portion so the day's intake is right; each leftover is logged
          // when it is eaten, by `logLeftover`.
          let eatenServings = session.servings;
          if (session.plannedMealId) {
            const plans = usePlanStore.getState();
            const meal = plans.mealById(session.plannedMealId);
            const hasLeftovers =
              meal !== undefined &&
              (plans.planForMeal(meal.id)?.meals ?? []).some(
                (m) => m.leftoverOf === meal.id,
              );
            if (meal && hasLeftovers) {
              eatenServings = Math.min(session.servings, meal.servings);
            }
          }

          const completed: CookSession = {
            ...session,
            servings: eatenServings,
            status: "completed",
            completedAt,
            retention,
            pantryDeducted: true,
          };

          set({
            sessions: get().sessions.map((s) =>
              s.id === completed.id ? completed : s,
            ),
            activeId: null,
          });
          return completed;
        },

        logLeftover(mealId) {
          const plans = usePlanStore.getState();
          const meal = plans.mealById(mealId);
          if (!meal || !meal.leftoverOf || meal.status !== "planned") return undefined;

          const now = nowIso();
          const session: CookSession = {
            id: uid(),
            userId: useProfileStore.getState().userId(),
            recipeId: meal.recipeId,
            plannedMealId: meal.id,
            servings: meal.servings,
            status: "completed",
            startedAt: now,
            completedAt: now,
            ingredientLogs: [],
            stepLogs: [],
            temperatureHistory: [],
            pantryDeducted: true,
          };
          set({ sessions: [...get().sessions, session].slice(-MAX_SESSIONS) });
          plans.setStatus(meal.id, "cooked");
          return session;
        },

        abandon() {
          patchActive((s) => ({ ...s, status: "abandoned" }));
          set({ activeId: null });
        },

        reset() {
          set({ sessions: [], activeId: null });
        },
      };
    },
    persistConfig<CookState, CookPersisted>(COOK_STORE_KEY, {
      // `activeId` is persisted on purpose: a refresh resumes the cooking flow.
      partialize: (s) => ({
        sessions: s.sessions.slice(-MAX_SESSIONS),
        activeId: s.activeId,
      }),
    }),
  ),
);

trackHydration(COOK_STORE_KEY, useCookStore);
