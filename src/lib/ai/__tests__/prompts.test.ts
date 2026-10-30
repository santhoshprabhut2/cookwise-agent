import { describe, expect, it } from "vitest";
import { timeLimitsLine } from "../prompts";
import type { AiMealPlanRequest } from "../schemas";

const profile = (timeSchedule?: AiMealPlanRequest["profile"]["timeSchedule"]) =>
  ({ timeSchedule }) as AiMealPlanRequest["profile"];

describe("timeLimitsLine", () => {
  it("lists only the meals that are capped, in week order", () => {
    const line = timeLimitsLine(
      profile({
        thu: { breakfast: "very_little" },
        mon: { breakfast: "little", dinner: "plenty" },
        wed: { lunch: "some" },
      }),
    );
    expect(line).toContain("mon breakfast 20 min, wed lunch 30 min, thu breakfast 10 min");
    expect(line).not.toContain("dinner");
  });

  it("says nothing when the schedule leaves every meal unlimited", () => {
    expect(timeLimitsLine(profile({ tue: { lunch: "plenty" } }))).toBeUndefined();
    expect(timeLimitsLine(profile(undefined))).toBeUndefined();
  });
});
