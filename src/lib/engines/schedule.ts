/**
 * Helpers for the weekly cooking-time grid (`UserProfile.timeSchedule`).
 *
 * Pure and UI-free. The grid component renders and edits through these so the
 * numbers shown on screen are exactly the ones the planner uses.
 */

import type {
  ScheduledMealType,
  SlotTime,
  TimeAvailability,
  TimeSchedule,
  WeekdayKey,
} from "@/lib/types";
import {
  SCHEDULED_MEAL_TYPES,
  SLOT_TIME_MIN,
  SLOT_TIME_ORDER,
  WEEKDAY_KEYS,
} from "./constants";
import { timeLimitFor } from "./planner";

/** A fully filled grid: every day, every scheduled meal. */
export type FullTimeSchedule = Record<WeekdayKey, Record<ScheduledMealType, SlotTime>>;

/**
 * The level closest to a number of minutes, never rounding a short slot up.
 * 35 minutes counts as "some time" (30), anything longer than 40 as "plenty".
 */
export function slotTimeForMinutes(minutes: number): SlotTime {
  if (minutes <= SLOT_TIME_MIN.very_little) return "very_little";
  if (minutes <= SLOT_TIME_MIN.little) return "little";
  if (minutes <= 40) return "some";
  return "plenty";
}

/** The level the single time setting implies for a day of the week. */
export function defaultSlotTime(
  availability: TimeAvailability,
  dayIndex: number,
): SlotTime {
  return slotTimeForMinutes(timeLimitFor(availability, dayIndex));
}

/** What a cell shows: the saved level, or the one the single setting implies. */
export function scheduleCell(
  schedule: TimeSchedule | undefined,
  availability: TimeAvailability,
  day: WeekdayKey,
  meal: ScheduledMealType,
): { level: SlotTime; custom: boolean } {
  const saved = schedule?.[day]?.[meal];
  if (saved) return { level: saved, custom: true };
  return {
    level: defaultSlotTime(availability, WEEKDAY_KEYS.indexOf(day)),
    custom: false,
  };
}

/** Fill every cell, keeping what the user already set. */
export function materializeSchedule(
  availability: TimeAvailability,
  schedule?: TimeSchedule,
): FullTimeSchedule {
  const out = {} as FullTimeSchedule;
  WEEKDAY_KEYS.forEach((day, dayIndex) => {
    const row = {} as Record<ScheduledMealType, SlotTime>;
    for (const meal of SCHEDULED_MEAL_TYPES) {
      row[meal] = schedule?.[day]?.[meal] ?? defaultSlotTime(availability, dayIndex);
    }
    out[day] = row;
  });
  return out;
}

/** The next level when a cell is tapped: shortest to longest, then round again. */
export function nextSlotTime(level: SlotTime): SlotTime {
  const at = SLOT_TIME_ORDER.indexOf(level);
  return SLOT_TIME_ORDER[(at + 1) % SLOT_TIME_ORDER.length];
}

/** Set one cell, filling the rest of the grid from the single time setting. */
export function setScheduleCell(
  schedule: TimeSchedule | undefined,
  availability: TimeAvailability,
  day: WeekdayKey,
  meal: ScheduledMealType,
  level: SlotTime,
): FullTimeSchedule {
  const next = materializeSchedule(availability, schedule);
  next[day][meal] = level;
  return next;
}

/** Whether the user has saved any per-meal times at all. */
export function hasSchedule(schedule: TimeSchedule | undefined): boolean {
  if (!schedule) return false;
  return WEEKDAY_KEYS.some((day) => Object.keys(schedule[day] ?? {}).length > 0);
}

/** How many scheduled meals allow 20 minutes or less. */
export function rushedMealCount(
  schedule: TimeSchedule | undefined,
  availability: TimeAvailability,
): number {
  const full = materializeSchedule(availability, schedule);
  let n = 0;
  for (const day of WEEKDAY_KEYS) {
    for (const meal of SCHEDULED_MEAL_TYPES) {
      if (SLOT_TIME_MIN[full[day][meal]] <= SLOT_TIME_MIN.little) n += 1;
    }
  }
  return n;
}
