/**
 * Demo user + demo pantry used when the app boots with an empty database.
 *
 * Pure data — this module must never import a store (the stores import it).
 */

import type { PantrySource, TimeSchedule, Unit, UserProfile } from "@/lib/types";
import { nowIso } from "@/lib/utils";

/** Local-only user id used until a Supabase auth user signs in. */
export const DEMO_USER_ID = "demo-user";

/**
 * A blank profile used as the base for onboarding (`setProfile` merges into it)
 * and as a safe fallback for the engines when onboarding has not run yet.
 */
export function createEmptyProfile(id: string = DEMO_USER_ID): UserProfile {
  const ts = nowIso();
  return {
    id,
    name: "",
    diet: "vegetarian",
    allergies: [],
    restrictions: [],
    goal: "balanced",
    dailyCalorieTarget: 2000,
    proteinTargetG: 60,
    equipment: ["stove"],
    favoriteFoods: [],
    dislikedIngredients: [],
    cuisines: [],
    spiceLevel: 3,
    budgetMonthly: 5000,
    currency: "INR",
    skill: "beginner",
    timeAvailability: "medium",
    priorities: ["nutrition", "taste", "time", "budget", "waste_reduction"],
    servingsDefault: 2,
    onboardingComplete: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Santhosh's week, as he described it: how long he has to cook each meal.
 * "Less / little time" is about 20 minutes, "very little" about 10, "some time"
 * about 30, and "have time" is unlimited.
 */
export const DEMO_TIME_SCHEDULE: TimeSchedule = {
  mon: { breakfast: "little", lunch: "plenty", dinner: "plenty" },
  tue: { breakfast: "plenty", lunch: "plenty", dinner: "plenty" },
  wed: { breakfast: "little", lunch: "very_little", dinner: "plenty" },
  thu: { breakfast: "very_little", lunch: "plenty", dinner: "plenty" },
  fri: { breakfast: "plenty", lunch: "some", dinner: "plenty" },
  sat: { breakfast: "plenty", lunch: "plenty", dinner: "plenty" },
  sun: { breakfast: "plenty", lunch: "plenty", dinner: "plenty" },
};

/**
 * Santhosh — the persona in the reference mockups.
 * `onboardingComplete` is true so every screen works straight after seeding.
 *
 * NOTE: `city` carries "Chennai, India" (the mockup's subtitle) because
 * `UserProfile` has no country field.
 */
export function createDemoProfile(id: string = DEMO_USER_ID): UserProfile {
  const ts = nowIso();
  return {
    id,
    name: "Santhosh",
    age: 20,
    city: "Chennai, India",
    gender: "male",
    heightCm: 172,
    weightKg: 65,

    diet: "non_vegetarian",
    allergies: [],
    restrictions: [],

    goal: "muscle_gain",
    dailyCalorieTarget: 2500,
    proteinTargetG: 130,

    equipment: ["stove", "mixer", "pressure_cooker", "frying_pan", "dosa_pan"],

    favoriteFoods: ["dosa", "biryani", "egg bhurji"],
    dislikedIngredients: [],
    cuisines: ["south_indian", "north_indian"],
    spiceLevel: 2,

    budgetMonthly: 5000,
    currency: "INR",

    skill: "beginner",
    timeAvailability: "varies",
    timeSchedule: DEMO_TIME_SCHEDULE,
    priorities: ["nutrition", "budget", "time", "taste", "waste_reduction"],
    servingsDefault: 2,

    onboardingComplete: true,
    createdAt: ts,
    updatedAt: ts,
  };
}

export interface DemoPantryRow {
  ingredientId: string;
  /** Fallback display name if the catalog entry is missing. */
  name: string;
  quantity: number;
  unit: Unit;
  /** Expiry is computed relative to the day seeding runs. */
  expiresInDays: number;
  source: PantrySource;
}

/** The pantry shown in the mockups (quantities + expiry chips). */
export const DEMO_PANTRY: DemoPantryRow[] = [
  { ingredientId: "tomato", name: "Tomato", quantity: 500, unit: "g", expiresInDays: 2, source: "manual" },
  { ingredientId: "onion", name: "Onion", quantity: 1000, unit: "g", expiresInDays: 5, source: "manual" },
  { ingredientId: "egg", name: "Eggs", quantity: 6, unit: "pcs", expiresInDays: 7, source: "manual" },
  { ingredientId: "chicken", name: "Chicken", quantity: 500, unit: "g", expiresInDays: 3, source: "manual" },
  { ingredientId: "spinach", name: "Spinach", quantity: 200, unit: "g", expiresInDays: 3, source: "manual" },
  { ingredientId: "milk", name: "Milk", quantity: 1000, unit: "ml", expiresInDays: 4, source: "manual" },
  { ingredientId: "rice", name: "Rice", quantity: 1000, unit: "g", expiresInDays: 45, source: "manual" },
  { ingredientId: "coconut", name: "Coconut", quantity: 1, unit: "pcs", expiresInDays: 7, source: "manual" },
];

/** Today's meals forced by the seeder so Home matches the mockup. */
export const DEMO_TODAY_MEALS = {
  breakfast: "ragi-dosa",
  lunch: "chicken-biryani",
  dinner: "egg-bhurji-chapati",
} as const;
