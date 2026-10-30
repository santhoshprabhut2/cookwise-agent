/**
 * Cookwise agent — public surface.
 *
 * See `docs/AGENT.md` for the architecture, the loop, and the decision schema.
 */

export { CookwiseAgent, runAgentCycle } from "./agent";
export { DEFAULTS, decide, goalsFor, perceive, type PerceiveInput } from "./policy";
export type {
  AgentAction,
  AgentActionType,
  AgentCycleResult,
  AgentDecision,
  AgentEffect,
  AgentGoal,
  AgentGoalKind,
  AgentOptions,
  Observation,
  Percept,
} from "./types";
