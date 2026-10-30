/**
 * Cookwise agent — the orchestrator.
 *
 * One `runCycle` call is one full turn of the agent loop:
 *
 *     perceive  →  decide  →  act  →  learn  →  (trace)
 *       ↑                                          │
 *       └──────────────  next cycle  ──────────────┘
 *
 * The agent is autonomous in that it chooses its own actions from sensed
 * state rather than executing a fixed script, and it is accountable in that
 * every action carries the rationale and the percepts that produced it.
 *
 * It deliberately does no I/O. The caller supplies a snapshot of the world and
 * receives the new state to persist. That keeps the whole decision process
 * deterministic and testable, and lets the same agent run on the server, in
 * the browser, or inside a test.
 */

import { adaptPlan, generateWeekPlan } from "@/lib/engines/planner";
import { buildGroceryList } from "@/lib/engines/grocery";
import { applyFeedback } from "@/lib/engines/learning";
import { nowIso } from "@/lib/utils";
import { DEFAULTS, decide, goalsFor, perceive, type PerceiveInput } from "./policy";
import type {
  AgentCycleResult,
  AgentDecision,
  AgentEffect,
  AgentOptions,
  Observation,
} from "./types";
import type {
  GroceryList,
  MealPlan,
  MealPlanRequest,
  PreferenceModel,
  Recipe,
} from "@/lib/types";

export class CookwiseAgent {
  private readonly opts: AgentOptions;

  constructor(opts: AgentOptions = {}) {
    this.opts = opts;
  }

  /** Sense the world. Thin wrapper so callers use one entry point. */
  perceive(input: PerceiveInput): Observation {
    return perceive(input, this.opts);
  }

  /** Choose actions for an observation, without carrying any of them out. */
  decide(obs: Observation): AgentDecision[] {
    return decide(obs, goalsFor(obs.profile), this.opts);
  }

  /**
   * Run one complete cycle.
   *
   * Decisions are executed in order, and each one sees the state produced by
   * the previous one. That is what lets `learn_preferences` improve the plan
   * that `generate_plan` builds later in the same cycle.
   */
  runCycle(input: PerceiveInput): AgentCycleResult {
    const startedAt = nowIso();
    const trace: string[] = [];

    const obs = this.perceive(input);
    const goals = goalsFor(obs.profile);

    trace.push(
      `perceive: ${obs.percepts.length} percept(s) — ${
        obs.percepts.map((p) => p.kind).join(", ") || "none"
      }`,
    );
    trace.push(
      `goals: ${goals.map((g) => `${g.kind}=${g.weight}`).join(", ")}`,
    );

    const decisions = decide(obs, goals, this.opts);
    trace.push(
      `decide: ${decisions.length} decision(s) — ${decisions
        .map((d) => d.action.type)
        .join(", ")}`,
    );

    const minConfidence = this.opts.minConfidence ?? DEFAULTS.minConfidence;
    const maxActions = this.opts.maxActionsPerCycle ?? DEFAULTS.maxActionsPerCycle;

    // Mutable working state, threaded through the decisions in order.
    let plan: MealPlan | undefined = obs.plan;
    let groceryList: GroceryList | undefined = obs.groceryList;
    let preferences: PreferenceModel = obs.preferences;

    const effects: AgentEffect[] = [];
    let executed = 0;

    for (const d of decisions) {
      if (d.confidence < minConfidence) {
        trace.push(
          `skip: ${d.action.type} (confidence ${d.confidence} < ${minConfidence})`,
        );
        continue;
      }
      if (executed >= maxActions) {
        trace.push(`skip: ${d.action.type} (action cap ${maxActions} reached)`);
        continue;
      }

      const effect = this.execute(d, obs, { plan, groceryList, preferences });
      effects.push(effect);
      executed += 1;

      if (effect.plan) plan = effect.plan;
      if (effect.groceryList) groceryList = effect.groceryList;
      if (effect.preferences) preferences = effect.preferences;

      trace.push(`act: ${d.action.type} — ${effect.summary}`);
    }

    return {
      startedAt,
      finishedAt: nowIso(),
      goals,
      observation: obs,
      decisions,
      effects,
      trace,
    };
  }

  // -------------------------------------------------------------------------
  // Action execution
  // -------------------------------------------------------------------------

  private execute(
    decision: AgentDecision,
    obs: Observation,
    state: {
      plan?: MealPlan;
      groceryList?: GroceryList;
      preferences: PreferenceModel;
    },
  ): AgentEffect {
    const base = { decisionId: decision.id, action: decision.action.type };

    try {
      switch (decision.action.type) {
        case "learn_preferences": {
          const recipeById = new Map<string, Recipe>(
            obs.recipes.map((r) => [r.id, r]),
          );
          let model = state.preferences;
          let applied = 0;
          for (const fb of decision.action.feedback) {
            const recipe = recipeById.get(fb.recipeId);
            if (!recipe) continue;
            model = applyFeedback(model, fb, recipe);
            applied += 1;
          }
          return {
            ...base,
            ok: true,
            summary: `Applied ${applied} rating(s); model now has ${model.feedbackCount} total.`,
            preferences: model,
          };
        }

        case "generate_plan": {
          const req: MealPlanRequest = {
            profile: obs.profile,
            weekStart: decision.action.weekStart,
            pantry: obs.pantry,
            preferences: state.preferences,
            lockedMeals: state.plan?.meals.filter((m) => m.locked) ?? [],
          };
          const next = generateWeekPlan(req, obs.recipes, {
            seed: decision.action.seed,
            ingredients: obs.ingredients,
            today: obs.today,
          });
          return {
            ...base,
            ok: true,
            summary: `Generated a plan with ${next.meals.length} meal(s) for week of ${next.weekStart}.`,
            plan: next,
          };
        }

        case "adapt_plan": {
          if (!state.plan) {
            return {
              ...base,
              ok: false,
              summary: "Cannot adapt: no plan in state.",
              error: "no_plan",
            };
          }
          const before = state.plan;
          const next = adaptPlan(before, decision.action.change, {
            profile: obs.profile,
            recipes: obs.recipes,
            pantry: obs.pantry,
            preferences: state.preferences,
          });
          const changed = countChanged(before, next);
          return {
            ...base,
            ok: true,
            summary: `Adapted the plan for "${decision.action.change.type}"; ${changed} meal(s) changed.`,
            plan: next,
          };
        }

        case "build_grocery_list": {
          if (!state.plan) {
            return {
              ...base,
              ok: false,
              summary: "Cannot build a list: no plan in state.",
              error: "no_plan",
            };
          }
          const list = buildGroceryList(
            state.plan,
            obs.recipes,
            obs.pantry,
            obs.ingredients,
          );
          return {
            ...base,
            ok: true,
            summary: `Built a grocery list with ${list.items.length} item(s).`,
            groceryList: list,
          };
        }

        case "flag_expiring": {
          const n = decision.action.ingredientIds.length;
          return {
            ...base,
            ok: true,
            summary: `Flagged ${n} item(s) expiring within ${decision.action.withinDays} day(s).`,
          };
        }

        case "no_op":
          return { ...base, ok: true, summary: decision.action.because };
      }
    } catch (err) {
      return {
        ...base,
        ok: false,
        summary: "Action threw while executing.",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/** How many meals differ between two versions of a plan. */
function countChanged(before: MealPlan, after: MealPlan): number {
  const prev = new Map(before.meals.map((m) => [m.id, m]));
  let n = 0;
  for (const m of after.meals) {
    const old = prev.get(m.id);
    if (!old) {
      n += 1;
      continue;
    }
    if (
      old.recipeId !== m.recipeId ||
      old.servings !== m.servings ||
      old.status !== m.status
    ) {
      n += 1;
    }
  }
  return n;
}

/** Convenience for callers that just want one cycle without holding an instance. */
export function runAgentCycle(
  input: PerceiveInput,
  opts: AgentOptions = {},
): AgentCycleResult {
  return new CookwiseAgent(opts).runCycle(input);
}
