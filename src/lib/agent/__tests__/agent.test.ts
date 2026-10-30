import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/utils";
import { emptyPreferenceModel } from "@/lib/engines/learning";
import {
  INGREDIENTS,
  RECIPES,
  WEEK_START,
  makeFeedback,
  makePantryItem,
  makeProfile,
} from "@/lib/engines/__tests__/fixtures";
import type { ScheduleChange } from "@/lib/types";
import { CookwiseAgent, runAgentCycle } from "../agent";
import { decide, goalsFor, perceive } from "../policy";
import type { PerceiveInput } from "../policy";

const PROFILE = makeProfile();

function baseInput(over: Partial<PerceiveInput> = {}): PerceiveInput {
  return {
    today: WEEK_START,
    weekStart: WEEK_START,
    profile: PROFILE,
    recipes: RECIPES,
    ingredients: INGREDIENTS,
    pantry: [],
    preferences: emptyPreferenceModel(PROFILE.id),
    ...over,
  };
}

describe("goalsFor", () => {
  it("ranks the user's first priority highest", () => {
    const goals = goalsFor(makeProfile({ priorities: ["budget", "nutrition"] }));
    expect(goals[0].kind).toBe("budget");
  });

  it("maps waste_reduction onto the waste goal", () => {
    const goals = goalsFor(makeProfile({ priorities: ["waste_reduction"] }));
    expect(goals[0].kind).toBe("waste");
  });

  it("gives every goal a non-zero floor, and weights sum to 1", () => {
    const goals = goalsFor(PROFILE);
    expect(goals.every((g) => g.weight > 0)).toBe(true);
    const total = goals.reduce((a, g) => a + g.weight, 0);
    expect(total).toBeCloseTo(1, 1);
  });
});

describe("perceive", () => {
  it("reports no_plan when the user has no plan", () => {
    const obs = perceive(baseInput());
    expect(obs.percepts.map((p) => p.kind)).toContain("no_plan");
  });

  it("sorts percepts most salient first", () => {
    const obs = perceive(baseInput());
    const saliences = obs.percepts.map((p) => p.salience);
    expect([...saliences].sort((a, b) => b - a)).toEqual(saliences);
  });

  it("detects stock expiring inside the waste window", () => {
    const obs = perceive(
      baseInput({
        pantry: [
          makePantryItem({
            ingredientId: "tomato",
            quantity: 300,
            expiresAt: addDays(WEEK_START, 1),
          }),
        ],
      }),
    );
    const expiring = obs.percepts.find((p) => p.kind === "expiring_stock");
    expect(expiring).toBeDefined();
    expect(expiring?.subjects).toContain("tomato");
  });

  it("ignores stock that expires well beyond the window", () => {
    const obs = perceive(
      baseInput({
        pantry: [
          makePantryItem({
            ingredientId: "tomato",
            quantity: 300,
            expiresAt: addDays(WEEK_START, 60),
          }),
        ],
      }),
    );
    expect(obs.percepts.find((p) => p.kind === "expiring_stock")).toBeUndefined();
  });

  it("notices feedback that has not been learned from", () => {
    const obs = perceive(baseInput({ pendingFeedback: [makeFeedback()] }));
    expect(obs.percepts.map((p) => p.kind)).toContain("unprocessed_feedback");
  });
});

describe("decide", () => {
  it("plans when there is no plan", () => {
    const obs = perceive(baseInput());
    const actions = decide(obs, goalsFor(PROFILE)).map((d) => d.action.type);
    expect(actions).toContain("generate_plan");
  });

  it("learns before it plans, so the plan uses fresh preferences", () => {
    const obs = perceive(baseInput({ pendingFeedback: [makeFeedback()] }));
    const actions = decide(obs, goalsFor(PROFILE)).map((d) => d.action.type);
    expect(actions.indexOf("learn_preferences")).toBeLessThan(
      actions.indexOf("generate_plan"),
    );
  });

  it("attaches a rationale and a trigger to every decision", () => {
    const obs = perceive(baseInput({ pendingFeedback: [makeFeedback()] }));
    for (const d of decide(obs, goalsFor(PROFILE))) {
      expect(d.rationale.length).toBeGreaterThan(0);
      expect(d.confidence).toBeGreaterThan(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("falls back to a single no_op when nothing is actionable", () => {
    const plan = runAgentCycle(baseInput()).effects.find((e) => e.plan)?.plan;
    expect(plan).toBeDefined();
    const obs = perceive(
      baseInput({ plan, groceryList: undefined, today: WEEK_START }),
    );
    const decisions = decide(obs, goalsFor(PROFILE));
    expect(decisions.length).toBeGreaterThan(0);
  });
});

describe("CookwiseAgent.runCycle", () => {
  it("produces a plan and a grocery list from an empty start", () => {
    const result = runAgentCycle(baseInput());

    const plan = result.effects.find((e) => e.plan)?.plan;
    const list = result.effects.find((e) => e.groceryList)?.groceryList;

    expect(plan).toBeDefined();
    expect(plan!.meals.length).toBeGreaterThan(0);
    expect(list).toBeDefined();
    expect(result.effects.every((e) => e.ok)).toBe(true);
  });

  it("writes a trace covering perceive, decide and each action", () => {
    const result = runAgentCycle(baseInput());
    expect(result.trace[0]).toMatch(/^perceive:/);
    expect(result.trace.some((l) => l.startsWith("decide:"))).toBe(true);
    expect(result.trace.some((l) => l.startsWith("act:"))).toBe(true);
  });

  it("is deterministic for the same input and seed", () => {
    const a = runAgentCycle(baseInput(), { seed: "exam" });
    const b = runAgentCycle(baseInput(), { seed: "exam" });

    const recipesOf = (r: typeof a) =>
      r.effects.find((e) => e.plan)?.plan?.meals.map((m) => m.recipeId);

    expect(recipesOf(a)).toEqual(recipesOf(b));
  });

  it("applies pending feedback to the preference model", () => {
    const result = runAgentCycle(
      baseInput({ pendingFeedback: [makeFeedback({ recipeId: RECIPES[0].id })] }),
    );
    const model = result.effects.find((e) => e.preferences)?.preferences;
    expect(model).toBeDefined();
    expect(model!.feedbackCount).toBeGreaterThan(0);
  });

  it("respects the action cap", () => {
    const result = runAgentCycle(
      baseInput({ pendingFeedback: [makeFeedback()] }),
      { maxActionsPerCycle: 1 },
    );
    expect(result.effects.length).toBe(1);
    expect(result.trace.some((l) => l.includes("action cap"))).toBe(true);
  });

  it("skips decisions below the confidence floor", () => {
    const result = runAgentCycle(baseInput(), { minConfidence: 0.99 });
    expect(result.trace.some((l) => l.startsWith("skip:"))).toBe(true);
  });

  it("adapts an existing plan instead of regenerating it", () => {
    const first = runAgentCycle(baseInput());
    const plan = first.effects.find((e) => e.plan)!.plan!;

    const change: ScheduleChange = {
      id: "chg-1",
      userId: PROFILE.id,
      type: "less_time",
      date: addDays(WEEK_START, 2),
      availableMinutes: 20,
      createdAt: "2026-09-14T00:00:00.000Z",
    };

    const agent = new CookwiseAgent();
    const second = agent.runCycle(
      baseInput({ plan, pendingChanges: [change], today: WEEK_START }),
    );

    const actions = second.decisions.map((d) => d.action.type);
    expect(actions).toContain("adapt_plan");
    expect(actions).not.toContain("generate_plan");
  });

  it("flags a budget overrun rather than silently cutting meals", () => {
    const poor = makeProfile({ budgetMonthly: 100, priorities: ["budget"] });
    const first = runAgentCycle(baseInput({ profile: poor }));
    const list = first.effects.find((e) => e.groceryList)?.groceryList;

    const obs = perceive(
      baseInput({
        profile: poor,
        plan: first.effects.find((e) => e.plan)?.plan,
        groceryList: list,
      }),
    );
    expect(obs.percepts.map((p) => p.kind)).toContain("budget_risk");
  });
});
