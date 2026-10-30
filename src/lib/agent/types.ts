/**
 * Cookwise agent — domain model.
 *
 * This file names the parts of an autonomous agent so the architecture is
 * legible without reading the implementation:
 *
 *   Goal         what the agent is trying to achieve
 *   Observation  what it can currently sense about the world
 *   Decision     an action it chose, with the reason it chose it
 *   Action       the effect it intends to have
 *   CycleResult  one full turn of the sense → decide → act → learn loop
 *
 * Nothing here performs I/O. The agent is a pure function of its observation,
 * which is what makes every decision reproducible and unit-testable.
 */

import type {
  GroceryList,
  ID,
  ISODate,
  ISODateTime,
  Ingredient,
  MealFeedback,
  MealPlan,
  PantryItem,
  PreferenceModel,
  Recipe,
  ScheduleChange,
  UserProfile,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

/**
 * The competing objectives the agent balances. These mirror the user's
 * `priorities` list, so the agent optimises what the user actually said
 * mattered rather than a fixed objective.
 */
export type AgentGoalKind =
  | "nutrition" // hit calorie and protein targets
  | "waste" // consume stock before it expires
  | "budget" // stay inside the weekly spend
  | "taste" // match learned preferences, keep variety
  | "time" // respect how long the user actually has
  | "health"; // preserve nutrients during cooking

export interface AgentGoal {
  kind: AgentGoalKind;
  /** 0..1. Derived from the user's ordered priorities. */
  weight: number;
}

// ---------------------------------------------------------------------------
// Perception
// ---------------------------------------------------------------------------

/** A single thing the agent noticed that may warrant action. */
export interface Percept {
  kind:
    | "no_plan"
    | "stale_plan"
    | "expiring_stock"
    | "schedule_change"
    | "unprocessed_feedback"
    | "missing_grocery_list"
    | "budget_risk";
  /** 0..1 — how strongly this percept argues for acting. */
  salience: number;
  /** Human-readable, surfaced in the UI and the decision log. */
  detail: string;
  /** Ids of the domain objects that produced this percept. */
  subjects?: ID[];
}

/**
 * Everything the agent can sense this cycle. Assembled by `perceive`,
 * never mutated afterwards.
 */
export interface Observation {
  today: ISODate;
  weekStart: ISODate;
  profile: UserProfile;
  recipes: Recipe[];
  ingredients: Ingredient[];
  pantry: PantryItem[];
  plan?: MealPlan;
  groceryList?: GroceryList;
  preferences: PreferenceModel;
  /** Changes the user reported that the plan has not absorbed yet. */
  pendingChanges: ScheduleChange[];
  /** Feedback not yet folded into the preference model. */
  pendingFeedback: MealFeedback[];
  /** Derived signals, ranked by salience. */
  percepts: Percept[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type AgentActionType =
  | "generate_plan"
  | "adapt_plan"
  | "build_grocery_list"
  | "learn_preferences"
  | "flag_expiring"
  | "no_op";

export type AgentAction =
  | { type: "generate_plan"; weekStart: ISODate; seed?: string }
  | { type: "adapt_plan"; change: ScheduleChange }
  | { type: "build_grocery_list"; planId: ID }
  | { type: "learn_preferences"; feedback: MealFeedback[] }
  | { type: "flag_expiring"; ingredientIds: ID[]; withinDays: number }
  | { type: "no_op"; because: string };

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/**
 * An action the policy selected, paired with the reason. The rationale is a
 * first-class field rather than a log line: an agent that cannot explain a
 * choice cannot be audited or trusted.
 */
export interface AgentDecision {
  id: ID;
  action: AgentAction;
  /** Why this action, in the user's language. */
  rationale: string;
  /** 0..1 — the policy's confidence that this is the right move now. */
  confidence: number;
  /** The percepts that triggered it. */
  triggeredBy: Percept[];
  /** Goals this action advances. */
  serves: AgentGoalKind[];
}

/** What actually changed when a decision was carried out. */
export interface AgentEffect {
  decisionId: ID;
  action: AgentActionType;
  ok: boolean;
  /** One line describing the observable outcome. */
  summary: string;
  /** Set when the action produced new state the caller must persist. */
  plan?: MealPlan;
  groceryList?: GroceryList;
  preferences?: PreferenceModel;
  error?: string;
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

export interface AgentCycleResult {
  startedAt: ISODateTime;
  finishedAt: ISODateTime;
  goals: AgentGoal[];
  observation: Observation;
  decisions: AgentDecision[];
  effects: AgentEffect[];
  /** Flat, ordered, human-readable trace of the whole cycle. */
  trace: string[];
}

/** Tuning knobs. Defaults live in `policy.ts`. */
export interface AgentOptions {
  /** Treat stock expiring within this many days as urgent. */
  wasteWindowDays?: number;
  /** A plan older than this many days is considered stale. */
  stalePlanDays?: number;
  /** Decisions below this confidence are reported but not executed. */
  minConfidence?: number;
  /** Cap on actions executed per cycle, so one run cannot thrash the state. */
  maxActionsPerCycle?: number;
  /** Deterministic seed for plan generation. */
  seed?: string;
}
