"use client";

import { Fragment } from "react";
import { SCHEDULED_MEAL_TYPES, WEEKDAY_KEYS } from "@/lib/engines/constants";
import { nextSlotTime, scheduleCell, setScheduleCell } from "@/lib/engines/schedule";
import type { SlotTime, TimeAvailability, TimeSchedule } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SCHEDULED_MEAL_LABELS, SLOT_TIME_LABELS, WEEKDAY_LABELS } from "./options";

const LEVEL_STYLES: Record<SlotTime, string> = {
  very_little: "bg-red-100 text-red-600",
  little: "bg-orange-100 text-orange-600",
  some: "bg-amber-100 text-amber-600",
  plenty: "bg-green-100 text-green-700",
};

export interface TimeScheduleGridProps {
  /** The saved schedule, or `undefined` while the single setting applies. */
  value: TimeSchedule | undefined;
  /** The single time setting, used for cells the user has not set. */
  availability: TimeAvailability;
  onChange: (next: TimeSchedule) => void;
}

/**
 * Seven days by three meals. Tap a cell to step through how long you have to
 * cook it: 10 min, 20 min, 30 min, then free. The planner treats a cell as a
 * hard limit, so a 10 minute slot only ever gets a 10 minute dish or a leftover.
 */
export function TimeScheduleGrid({ value, availability, onChange }: TimeScheduleGridProps) {
  return (
    <div
      role="group"
      aria-label="How long you have to cook each meal this week"
      className="rounded-2xl border border-border bg-surface p-3"
    >
      <div className="grid grid-cols-[40px_repeat(3,minmax(0,1fr))] items-center gap-1.5">
        <span aria-hidden="true" />
        {SCHEDULED_MEAL_TYPES.map((meal) => (
          <span
            key={meal}
            className="pb-0.5 text-center text-[11px] font-medium tracking-wide text-text-3 uppercase"
          >
            {SCHEDULED_MEAL_LABELS[meal]}
          </span>
        ))}

        {WEEKDAY_KEYS.map((day) => (
          <Fragment key={day}>
            <span className="text-[12px] font-semibold text-text-2">
              {WEEKDAY_LABELS[day].short}
            </span>
            {SCHEDULED_MEAL_TYPES.map((meal) => {
              const { level, custom } = scheduleCell(value, availability, day, meal);
              const labels = SLOT_TIME_LABELS[level];
              return (
                <button
                  key={meal}
                  type="button"
                  aria-label={`${WEEKDAY_LABELS[day].long} ${SCHEDULED_MEAL_LABELS[meal].toLowerCase()}: ${labels.words}, ${labels.minutes}. Tap to change.`}
                  onClick={() =>
                    onChange(setScheduleCell(value, availability, day, meal, nextSlotTime(level)))
                  }
                  className={cn(
                    "h-11 rounded-xl text-[12px] font-semibold transition-transform duration-150",
                    "active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    custom
                      ? LEVEL_STYLES[level]
                      : "border border-dashed border-border bg-surface text-text-3",
                  )}
                >
                  {labels.cell}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-snug text-text-3">
        Dashed cells follow your simple setting above. Tap any cell to set it yourself.
      </p>
    </div>
  );
}
