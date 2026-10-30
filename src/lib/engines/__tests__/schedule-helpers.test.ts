import { describe, expect, it } from "vitest";
import {
  defaultSlotTime,
  hasSchedule,
  materializeSchedule,
  nextSlotTime,
  rushedMealCount,
  scheduleCell,
  setScheduleCell,
  slotTimeForMinutes,
} from "../schedule";

describe("slotTimeForMinutes", () => {
  it.each([
    [5, "very_little"], [10, "very_little"], [11, "little"], [20, "little"],
    [21, "some"], [30, "some"], [35, "some"], [40, "some"], [41, "plenty"],
    [Number.POSITIVE_INFINITY, "plenty"],
  ])("%s minutes is %s", (minutes, expected) => {
    expect(slotTimeForMinutes(minutes)).toBe(expected);
  });
});

describe("defaultSlotTime", () => {
  it("follows the single time setting", () => {
    expect(defaultSlotTime("low", 0)).toBe("little");
    expect(defaultSlotTime("medium", 3)).toBe("some");
    expect(defaultSlotTime("high", 3)).toBe("plenty");
  });

  it("is rushed on weekdays and free at weekends when time varies", () => {
    expect(defaultSlotTime("varies", 1)).toBe("some");
    expect(defaultSlotTime("varies", 5)).toBe("plenty");
  });
});

describe("the grid", () => {
  it("shows a saved cell as custom and the rest as defaults", () => {
    const schedule = { thu: { breakfast: "very_little" as const } };
    expect(scheduleCell(schedule, "high", "thu", "breakfast")).toEqual({
      level: "very_little", custom: true,
    });
    expect(scheduleCell(schedule, "high", "thu", "lunch")).toEqual({
      level: "plenty", custom: false,
    });
  });

  it("fills every cell and keeps what was set", () => {
    const full = materializeSchedule("low", { mon: { dinner: "plenty" } });
    expect(full.mon.dinner).toBe("plenty");
    expect(full.mon.breakfast).toBe("little");
    expect(Object.keys(full)).toHaveLength(7);
    expect(Object.keys(full.sun)).toEqual(["breakfast", "lunch", "dinner"]);
  });

  it("changes one cell without disturbing the others", () => {
    const next = setScheduleCell(undefined, "medium", "wed", "lunch", "very_little");
    expect(next.wed.lunch).toBe("very_little");
    expect(next.wed.breakfast).toBe("some");
    expect(next.fri.dinner).toBe("some");
  });

  it("cycles shortest to longest and round again", () => {
    expect(nextSlotTime("very_little")).toBe("little");
    expect(nextSlotTime("little")).toBe("some");
    expect(nextSlotTime("some")).toBe("plenty");
    expect(nextSlotTime("plenty")).toBe("very_little");
  });
});

describe("summaries", () => {
  it("knows whether anything is saved", () => {
    expect(hasSchedule(undefined)).toBe(false);
    expect(hasSchedule({})).toBe(false);
    expect(hasSchedule({ mon: {} })).toBe(false);
    expect(hasSchedule({ mon: { lunch: "some" } })).toBe(true);
  });

  it("counts the rushed meals in the week", () => {
    // Santhosh: Mon bf little, Wed bf little + lunch very_little, Thu bf very_little.
    const schedule = {
      mon: { breakfast: "little", lunch: "plenty", dinner: "plenty" },
      wed: { breakfast: "little", lunch: "very_little", dinner: "plenty" },
      thu: { breakfast: "very_little", lunch: "plenty", dinner: "plenty" },
    } as const;
    expect(rushedMealCount(schedule, "high")).toBe(4);
  });
});
