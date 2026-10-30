"use client";

import { Chip, Input, SegmentedControl, Stepper } from "@/components/ui";
import type { SkillLevel, TimeAvailability } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import { hasSchedule } from "@/lib/engines/schedule";
import { BUDGET_PRESETS, SKILL_OPTIONS, TIME_OPTIONS } from "../options";
import { TimeScheduleGrid } from "../TimeScheduleGrid";
import { StepSection, numberOrUndefined, type StepProps } from "./common";

/** Step 6 — monthly budget, cooking skill, time availability, default servings. */
export function StepBudget({ draft, onChange, errors }: StepProps) {
  const budget = draft.budgetMonthly ?? 0;
  const time = draft.timeAvailability ?? "medium";

  return (
    <div className="space-y-6">
      <StepSection
        title="Monthly grocery budget"
        hint="The planner keeps your week inside roughly a quarter of this."
        error={errors?.budgetMonthly}
      >
        <Input
          label="Budget"
          inputMode="numeric"
          value={budget || ""}
          placeholder="5000"
          leftIcon={<span className="text-[15px] text-text-2">₹</span>}
          rightSlot={<span className="pr-2 text-xs text-text-3">/ month</span>}
          onChange={(e) => onChange({ budgetMonthly: numberOrUndefined(e.target.value) ?? 0 })}
        />
        <div className="flex flex-wrap gap-2">
          {BUDGET_PRESETS.map((preset) => (
            <Chip
              key={preset}
              selected={budget === preset}
              className="h-9 px-3.5 text-[13px]"
              onClick={() => onChange({ budgetMonthly: preset })}
            >
              {formatINR(preset)}
            </Chip>
          ))}
        </div>
      </StepSection>

      <StepSection title="Cooking skill">
        <SegmentedControl
          label="Cooking skill"
          value={draft.skill ?? "beginner"}
          onChange={(v) => onChange({ skill: v as SkillLevel })}
          options={SKILL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </StepSection>

      <StepSection
        title="Time available"
        hint={TIME_OPTIONS.find((o) => o.value === time)?.description}
      >
        <SegmentedControl
          label="Time available"
          size="sm"
          value={time}
          onChange={(v) => onChange({ timeAvailability: v as TimeAvailability })}
          options={TIME_OPTIONS.map((o) => ({
            value: o.value,
            label: o.value === "varies" ? "Varies" : o.label,
          }))}
        />
      </StepSection>

      <StepSection
        title="Your week"
        hint="Mornings rushed, evenings free? Tap a meal to say how long you really have. The planner never picks a dish that takes longer, and a long dish cooked once becomes a quick reheat at a rushed meal."
        action={
          hasSchedule(draft.timeSchedule) ? (
            <button
              type="button"
              className="text-xs font-semibold text-primary"
              onClick={() => onChange({ timeSchedule: undefined })}
            >
              Reset
            </button>
          ) : undefined
        }
      >
        <TimeScheduleGrid
          value={draft.timeSchedule}
          availability={time}
          onChange={(next) => onChange({ timeSchedule: next })}
        />
      </StepSection>

      <StepSection title="Default servings" hint="How many portions you usually cook.">
        <Stepper
          label="Default servings"
          value={draft.servingsDefault ?? 2}
          min={1}
          max={12}
          onChange={(v) => onChange({ servingsDefault: v })}
        />
      </StepSection>
    </div>
  );
}
