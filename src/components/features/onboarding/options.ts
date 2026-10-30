/**
 * Option label maps for onboarding, `/profile` and `/profile/edit`.
 *
 * Every enum the user picks during onboarding has exactly one human label here,
 * so the wizard, the profile summary rows and the edit form never disagree.
 * Values are the literal union members from `@/lib/types`.
 */

import type {
  DietType,
  Equipment,
  Goal,
  Priority,
  ScheduledMealType,
  SkillLevel,
  SlotTime,
  SpiceLevel,
  TimeAvailability,
  UserProfile,
  WeekdayKey,
} from "@/lib/types";
import { humanize } from "@/lib/utils";

export interface Option<T extends string = string> {
  value: T;
  label: string;
  /** Rendered `aria-hidden` next to the label. */
  emoji?: string;
  /** Short helper line on option cards. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Step 1 — About you
// ---------------------------------------------------------------------------

export type Gender = NonNullable<UserProfile["gender"]>;

export const GENDER_OPTIONS: Option<Gender>[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

// ---------------------------------------------------------------------------
// Step 2 — Diet
// ---------------------------------------------------------------------------

export const DIET_OPTIONS: Option<DietType>[] = [
  { value: "vegetarian", label: "Vegetarian", emoji: "🥗", description: "No meat, fish or eggs" },
  { value: "non_vegetarian", label: "Non-vegetarian", emoji: "🍗", description: "Everything goes" },
  { value: "eggetarian", label: "Eggetarian", emoji: "🥚", description: "Veg plus eggs" },
  { value: "vegan", label: "Vegan", emoji: "🌱", description: "No animal products" },
  { value: "pescatarian", label: "Pescatarian", emoji: "🐟", description: "Veg plus seafood" },
];

export const ALLERGY_OPTIONS: Option[] = [
  { value: "nuts", label: "Nuts", emoji: "🥜" },
  { value: "dairy", label: "Dairy", emoji: "🥛" },
  { value: "gluten", label: "Gluten", emoji: "🌾" },
  { value: "shellfish", label: "Shellfish", emoji: "🦐" },
  { value: "soy", label: "Soy", emoji: "🫘" },
  { value: "eggs", label: "Eggs", emoji: "🥚" },
];

export const RESTRICTION_OPTIONS: Option[] = [
  { value: "no_onion_garlic", label: "No onion / garlic" },
  { value: "low_sodium", label: "Low sodium" },
  { value: "gluten_free", label: "Gluten free" },
];

// ---------------------------------------------------------------------------
// Step 3 — Goals
// ---------------------------------------------------------------------------

export const GOAL_OPTIONS: Option<Goal>[] = [
  { value: "muscle_gain", label: "Muscle gain", emoji: "💪", description: "Extra calories and protein" },
  { value: "weight_loss", label: "Weight loss", emoji: "🎯", description: "A gentle daily deficit" },
  { value: "maintenance", label: "Maintenance", emoji: "⚖️", description: "Hold your current weight" },
  { value: "improve_energy", label: "Improve energy", emoji: "⚡", description: "Steadier meals through the day" },
  { value: "balanced", label: "Balanced", emoji: "🍲", description: "A bit of everything" },
];

// ---------------------------------------------------------------------------
// Step 4 — Kitchen
// ---------------------------------------------------------------------------

export const EQUIPMENT_OPTIONS: Option<Equipment>[] = [
  { value: "stove", label: "Stove", emoji: "🔥" },
  { value: "oven", label: "Oven", emoji: "🔆" },
  { value: "microwave", label: "Microwave", emoji: "📻" },
  { value: "pressure_cooker", label: "Pressure cooker", emoji: "🍲" },
  { value: "mixer", label: "Mixer", emoji: "🌀" },
  { value: "blender", label: "Blender", emoji: "🥤" },
  { value: "air_fryer", label: "Air fryer", emoji: "🍟" },
  { value: "frying_pan", label: "Frying pan", emoji: "🍳" },
  { value: "kadai", label: "Kadai", emoji: "🥘" },
  { value: "dosa_pan", label: "Dosa pan", emoji: "🥞" },
  { value: "tawa", label: "Tawa", emoji: "🫓" },
  { value: "steamer", label: "Steamer", emoji: "♨️" },
  { value: "rice_cooker", label: "Rice cooker", emoji: "🍚" },
  { value: "sensor_dock", label: "Sensor dock", emoji: "⚖️" },
];

// ---------------------------------------------------------------------------
// Step 5 — Taste
// ---------------------------------------------------------------------------

export const CUISINE_OPTIONS: Option[] = [
  { value: "south_indian", label: "South Indian", emoji: "🥥" },
  { value: "north_indian", label: "North Indian", emoji: "🫓" },
  { value: "continental", label: "Continental", emoji: "🥪" },
  { value: "chinese", label: "Chinese", emoji: "🥢" },
  { value: "mediterranean", label: "Mediterranean", emoji: "🫒" },
];

export const SPICE_LEVELS: { value: SpiceLevel; emoji: string; label: string }[] = [
  { value: 1, emoji: "🥛", label: "No spice" },
  { value: 2, emoji: "🙂", label: "Mild" },
  { value: 3, emoji: "🌶️", label: "Medium" },
  { value: 4, emoji: "🔥", label: "Hot" },
  { value: 5, emoji: "🥵", label: "Very hot" },
];

export function spiceMeta(level: number): { value: SpiceLevel; emoji: string; label: string } {
  return SPICE_LEVELS.find((s) => s.value === level) ?? SPICE_LEVELS[2];
}

// ---------------------------------------------------------------------------
// Step 6 — Budget & time
// ---------------------------------------------------------------------------

export const BUDGET_PRESETS = [3000, 5000, 8000, 12000] as const;

export const SKILL_OPTIONS: Option<SkillLevel>[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export const TIME_OPTIONS: Option<TimeAvailability>[] = [
  { value: "low", label: "Low", description: "Under 20 min a meal" },
  { value: "medium", label: "Medium", description: "About 30 min a meal" },
  { value: "high", label: "High", description: "Happy to cook longer" },
  { value: "varies", label: "Varies by day", description: "Some days rushed, some not" },
];

/** Weekly grid: what each level means, in words and on the cell. */
export const SLOT_TIME_LABELS: Record<
  SlotTime,
  { cell: string; words: string; minutes: string }
> = {
  very_little: { cell: "10 min", words: "Very little time", minutes: "about 10 minutes" },
  little: { cell: "20 min", words: "Little time", minutes: "about 20 minutes" },
  some: { cell: "30 min", words: "Some time", minutes: "about 30 minutes" },
  plenty: { cell: "Free", words: "Plenty of time", minutes: "no limit" },
};

export const WEEKDAY_LABELS: Record<WeekdayKey, { short: string; long: string }> = {
  mon: { short: "Mon", long: "Monday" },
  tue: { short: "Tue", long: "Tuesday" },
  wed: { short: "Wed", long: "Wednesday" },
  thu: { short: "Thu", long: "Thursday" },
  fri: { short: "Fri", long: "Friday" },
  sat: { short: "Sat", long: "Saturday" },
  sun: { short: "Sun", long: "Sunday" },
};

export const SCHEDULED_MEAL_LABELS: Record<ScheduledMealType, string> = {
  breakfast: "Morning",
  lunch: "Afternoon",
  dinner: "Evening",
};

// ---------------------------------------------------------------------------
// Step 7 — Priorities
// ---------------------------------------------------------------------------

export const PRIORITY_OPTIONS: Option<Priority>[] = [
  { value: "nutrition", label: "Nutrition", emoji: "🥦", description: "Hit my calorie and protein targets" },
  { value: "time", label: "Time", emoji: "⏱️", description: "Keep cooking short" },
  { value: "budget", label: "Budget", emoji: "💰", description: "Stay inside my monthly spend" },
  { value: "taste", label: "Taste", emoji: "😋", description: "Food I actually enjoy" },
  { value: "waste_reduction", label: "Waste reduction", emoji: "♻️", description: "Use what's about to expire" },
];

/** Fallback order used when the user ranks fewer than five priorities. */
export const DEFAULT_PRIORITIES: Priority[] = [
  "nutrition",
  "taste",
  "time",
  "budget",
  "waste_reduction",
];

/** Append the unranked priorities in the default order so the array is complete. */
export function completePriorities(picked: Priority[] | undefined): Priority[] {
  const ordered = (picked ?? []).filter((p, i, all) => all.indexOf(p) === i);
  for (const p of DEFAULT_PRIORITIES) if (!ordered.includes(p)) ordered.push(p);
  return ordered;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Human label for one enum value, falling back to a humanised slug. */
export function labelOf<T extends string>(
  options: Option<T>[],
  value: T | undefined | null,
  fallback = "—",
): string {
  if (!value) return fallback;
  return options.find((o) => o.value === value)?.label ?? humanize(value);
}

/** "Stove, Mixer, Pressure cooker" — empty list renders the fallback. */
export function labelsOf<T extends string>(
  options: Option<T>[],
  values: readonly T[] | undefined | null,
  fallback = "—",
): string {
  if (!values || values.length === 0) return fallback;
  return values.map((v) => labelOf(options, v)).join(", ");
}
