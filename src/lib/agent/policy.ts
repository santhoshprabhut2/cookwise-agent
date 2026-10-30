/**
 * Cookwise agent — perception and policy.
 *
 * Pure functions, no I/O, no React, no browser globals. `perceive` turns raw
 * domain state into ranked percepts; `decide` turns percepts into ranked,
 * justified decisions. Keeping both pure means the agent's judgement can be
 * unit-tested without a database, a network or a clock.
 */

import { expiringStock } from "@/lib/engines/planner";
import { groceryTotals } from "@/lib/engines/grocery";
import { WASTE_WINDOW_DAYS, WEEKS_PER_MONTH } from "@/lib/engines/constants";
import { daysBetween } from "@/lib/engines/helpers";
import { uid } from "@/lib/utils";
import type {
  GroceryList,
  ID,
  ISODate,
  Ingredient,
  MealFeedback,
  MealPlan,
  PantryItem,
  PreferenceModel,
  Priority,
  Recipe,
  ScheduleChange,
  UserProfile,
} from "@/lib/types";
import type {
  AgentDecision,
  AgentGoal,
  AgentGoalKind,
  AgentOptions,
  Observation,
  Percept,
} from "./types";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULTS: Required<Omit<AgentOptions, "seed">> = {
  wasteWindowDays: WASTE_WINDOW_DAYS,
  stalePlanDays: 7,
  minConfidence: 0.35,
  maxActionsPerCycle: 4,
};

/**
 * The user's ordered priorities map one-to-one onto agent goals. `health`
 * has no matching priority because it is the agent's own standing concern
 * (nutrient retention during cooking), not something the user ranks.
 */
const PRIORITY_TO_GOAL: Record<Priority, AgentGoalKind> = {
  nutrition: "nutrition",
  time: "time",
  budget: "budget",
  taste: "taste",
  waste_reduction: "waste",
};

/**
 * Turn the user's ordered priorities into weighted goals. First priority gets
 * the most weight; anything unlisted still gets a small floor so the agent
 * never completely ignores a dimension.
 */
export function goalsFor(profile: UserProfile): AgentGoal[] {
  const ordered = profile.priorities ?? [];
  const weights = new Map<AgentGoalKind, number>([
    ["nutrition", 0.1],
    ["waste", 0.1],
    ["budget", 0.1],
    ["taste", 0.1],
    ["time", 0.1],
    ["health", 0.1],
  ]);

  ordered.forEach((p, i) => {
    const goal = PRIORITY_TO_GOAL[p] ?? "nutrition";
    // 1.0, 0.75, 0.5, … by rank, added to the floor.
    const bonus = Math.max(0.25, 1 - i * 0.25);
    weights.set(goal, (weights.get(goal) ?? 0) + bonus);
  });

  const total = [...weights.values()].reduce((a, b) => a + b, 0) || 1;
  return [...weights.entries()]
    .map(([kind, w]) => ({ kind, weight: round2(w / total) }))
    .sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------------------
// Perception
// ---------------------------------------------------------------------------

export interface PerceiveInput {
  today: ISODate;
  weekStart: ISODate;
  profile: UserProfile;
  recipes: Recipe[];
  ingredients: Ingredient[];
  pantry: PantryItem[];
  plan?: MealPlan;
  groceryList?: GroceryList;
  preferences: PreferenceModel;
  pendingChanges?: ScheduleChange[];
  pendingFeedback?: MealFeedback[];
}

/**
 * Sense the world. Produces an immutable `Observation` whose `percepts` are
 * sorted most-salient first.
 */
export function perceive(
  input: PerceiveInput,
  opts: AgentOptions = {},
): Observation {
  const wasteWindow = opts.wasteWindowDays ?? DEFAULTS.wasteWindowDays;
  const staleDays = opts.stalePlanDays ?? DEFAULTS.stalePlanDays;

  const pendingChanges = input.pendingChanges ?? [];
  const pendingFeedback = input.pendingFeedback ?? [];
  const percepts: Percept[] = [];

  // 1. Is there a plan at all, and is it current?
  if (!input.plan) {
    percepts.push({
      kind: "no_plan",
      salience: 1,
      detail: "No meal plan exists for this week.",
    });
  } else {
    const age = daysBetween(input.plan.weekStart, input.today);
    if (age >= staleDays) {
      percepts.push({
        kind: "stale_plan",
        salience: 0.9,
        detail: `The current plan starts ${input.plan.weekStart} and is ${age} days old.`,
        subjects: [input.plan.id],
      });
    }
  }

  // 2. Stock about to spoil.
  const expiring = expiringStock(
    input.pantry,
    input.today,
    wasteWindow,
    input.ingredients,
  );
  if (expiring.size > 0) {
    const ids = [...expiring.keys()];
    const soonest = [...expiring.values()].reduce(
      (min, s) => (s.expiresAt < min ? s.expiresAt : min),
      [...expiring.values()][0].expiresAt,
    );
    const daysLeft = Math.max(0, daysBetween(input.today, soonest));
    percepts.push({
      kind: "expiring_stock",
      // Tighter deadline means higher salience.
      salience: clamp01(1 - daysLeft / (wasteWindow + 1)),
      detail: `${ids.length} pantry item(s) expire within ${wasteWindow} day(s); soonest ${soonest}.`,
      subjects: ids,
    });
  }

  // 3. Reported changes the plan has not absorbed.
  for (const change of pendingChanges) {
    percepts.push({
      kind: "schedule_change",
      salience: change.date <= input.today ? 1 : 0.7,
      detail: `Reported "${change.type}" for ${change.date}.`,
      subjects: [change.id],
    });
  }

  // 4. Feedback waiting to be learned from.
  if (pendingFeedback.length > 0) {
    percepts.push({
      kind: "unprocessed_feedback",
      salience: clamp01(0.4 + pendingFeedback.length * 0.15),
      detail: `${pendingFeedback.length} meal rating(s) not yet folded into the preference model.`,
      subjects: pendingFeedback.map((f) => f.id),
    });
  }

  // 5. A plan with no shopping list is a plan that cannot be executed.
  if (input.plan && !input.groceryList) {
    percepts.push({
      kind: "missing_grocery_list",
      salience: 0.6,
      detail: "The plan has no grocery list, so required stock is unknown.",
      subjects: [input.plan.id],
    });
  }

  // 6. Budget pressure.
  if (input.groceryList) {
    const totals = groceryTotals(input.groceryList);
    const weekly = (input.profile.budgetMonthly || 0) / WEEKS_PER_MONTH;
    if (weekly > 0 && totals.estimatedCost > weekly) {
      const over = totals.estimatedCost - weekly;
      percepts.push({
        kind: "budget_risk",
        salience: clamp01(over / weekly),
        detail: `Estimated spend exceeds the weekly budget by ${Math.round(over)}.`,
        subjects: [input.groceryList.id],
      });
    }
  }

  percepts.sort((a, b) => b.salience - a.salience);

  return {
    today: input.today,
    weekStart: input.weekStart,
    profile: input.profile,
    recipes: input.recipes,
    ingredients: input.ingredients,
    pantry: input.pantry,
    plan: input.plan,
    groceryList: input.groceryList,
    preferences: input.preferences,
    pendingChanges,
    pendingFeedback,
    percepts,
  };
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

/**
 * Choose what to do about what was sensed.
 *
 * Ordering matters and is deliberate: learn before planning, so a new plan
 * uses the freshest preference model; absorb schedule changes before building
 * a grocery list, so the list matches the final plan.
 */
export function decide(
  obs: Observation,
  goals: AgentGoal[],
  opts: AgentOptions = {},
): AgentDecision[] {
  const wasteWindow = opts.wasteWindowDays ?? DEFAULTS.wasteWindowDays;
  const weightOf = (k: AgentGoalKind): number =>
    goals.find((g) => g.kind === k)?.weight ?? 0.1;

  const decisions: AgentDecision[] = [];
  const find = (kind: Percept["kind"]): Percept[] =>
    obs.percepts.filter((p) => p.kind === kind);

  // 1. Learn first — a better model produces a better plan in the same cycle.
  const feedbackPercepts = find("unprocessed_feedback");
  if (feedbackPercepts.length > 0 && obs.pendingFeedback.length > 0) {
    decisions.push({
      id: uid(),
      action: { type: "learn_preferences", feedback: obs.pendingFeedback },
      rationale: `Fold ${obs.pendingFeedback.length} new rating(s) into the preference model before planning, so the plan reflects the latest taste.`,
      confidence: 0.95,
      triggeredBy: feedbackPercepts,
      serves: ["taste", "nutrition"],
    });
  }

  // 2. Surface expiring stock — cheap, always worth saying out loud.
  const expiringPercepts = find("expiring_stock");
  if (expiringPercepts.length > 0) {
    const ids = expiringPercepts.flatMap((p) => p.subjects ?? []);
    decisions.push({
      id: uid(),
      action: { type: "flag_expiring", ingredientIds: ids, withinDays: wasteWindow },
      rationale: `${ids.length} item(s) expire within ${wasteWindow} day(s). Prioritise recipes that consume them.`,
      confidence: clamp01(0.5 + weightOf("waste")),
      triggeredBy: expiringPercepts,
      serves: ["waste", "budget"],
    });
  }

  // 3. Plan: create one, refresh a stale one, or adapt to a reported change.
  const noPlan = find("no_plan");
  const stale = find("stale_plan");
  const changes = find("schedule_change");

  if (noPlan.length > 0 || stale.length > 0) {
    const triggers = [...noPlan, ...stale];
    decisions.push({
      id: uid(),
      action: { type: "generate_plan", weekStart: obs.weekStart, seed: opts.seed },
      rationale:
        noPlan.length > 0
          ? "No plan exists for this week, so build one from the goal, budget, pantry and learned preferences."
          : "The existing plan is stale, so regenerate it against current stock and preferences.",
      confidence: 0.9,
      triggeredBy: triggers,
      serves: ["nutrition", "budget", "waste", "taste"],
    });
  } else if (changes.length > 0 && obs.plan) {
    // Adapt rather than regenerate: preserves locked and already-cooked meals.
    for (const change of obs.pendingChanges) {
      const trigger = changes.find((c) => c.subjects?.includes(change.id));
      decisions.push({
        id: uid(),
        action: { type: "adapt_plan", change },
        rationale: `Re-plan around the reported "${change.type}" on ${change.date}, keeping locked and cooked meals untouched.`,
        confidence: 0.85,
        triggeredBy: trigger ? [trigger] : changes,
        serves: ["nutrition", "time"],
      });
    }
  }

  // 4. A plan without a list cannot be acted on.
  const missingList = find("missing_grocery_list");
  const willHavePlan =
    obs.plan ||
    decisions.some(
      (d) => d.action.type === "generate_plan" || d.action.type === "adapt_plan",
    );
  if (willHavePlan && (missingList.length > 0 || decisions.some((d) => d.action.type === "generate_plan"))) {
    decisions.push({
      id: uid(),
      action: { type: "build_grocery_list", planId: obs.plan?.id ?? "pending" },
      rationale:
        "Derive the shopping list from the final plan minus what the pantry already holds.",
      confidence: 0.8,
      triggeredBy: missingList,
      serves: ["budget", "waste"],
    });
  }

  // 5. Budget pressure is reported, not auto-corrected: spending is the
  //    user's call, so the agent surfaces it instead of silently downgrading.
  const budget = find("budget_risk");
  if (budget.length > 0) {
    decisions.push({
      id: uid(),
      action: {
        type: "no_op",
        because: "Budget overrun needs a human choice between cost, nutrition and variety.",
      },
      rationale: `${budget[0].detail} Flagging rather than cutting meals automatically.`,
      confidence: clamp01(0.4 + weightOf("budget")),
      triggeredBy: budget,
      serves: ["budget"],
    });
  }

  if (decisions.length === 0) {
    decisions.push({
      id: uid(),
      action: { type: "no_op", because: "Nothing actionable was sensed." },
      rationale: "Plan is current, nothing is expiring, and no feedback is pending.",
      confidence: 1,
      triggeredBy: [],
      serves: [],
    });
  }

  return decisions;
}

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Re-exported so tests can assert on ids without importing `@/lib/utils`. */
export type { ID };
