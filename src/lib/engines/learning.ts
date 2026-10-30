/**
 * Feedback → `PreferenceModel`.
 *
 * Every rating nudges the model with an exponential moving average
 * (`new = old + α·(target − old)`, α = 0.3) toward `(rating − 3) / 2`, which
 * maps a 1–5 star rating onto −1..1. Spice and portion are ratchets rather than
 * averages: each "too hot" shifts the spice target down a notch, each
 * "too little" adds 10 % to the plate.
 *
 * All updates are immutable — the store swaps in the returned object.
 */

import type {
  MealFeedback,
  PreferenceModel,
  Recipe,
  RecipeTag,
  SpiceLevel,
  UserProfile,
} from "@/lib/types";
import { clamp, nowIso } from "@/lib/utils";
import { ema, mean } from "./helpers";
import { isPlannable } from "./meals";

/** Smoothing factor for every affinity update (ARCHITECTURE §5). */
export const ALPHA = 0.3;

export const SPICE_STEP = 0.2;
export const PORTION_TOO_LITTLE = 1.1;
export const PORTION_TOO_MUCH = 0.9;
export const PORTION_MIN = 0.6;
export const PORTION_MAX = 1.6;

export function emptyPreferenceModel(userId: string): PreferenceModel {
  return {
    userId,
    recipeScores: {},
    ingredientAffinity: {},
    cuisineAffinity: {},
    tagAffinity: {},
    spiceAdjust: 0,
    portionAdjust: 1,
    feedbackCount: 0,
    updatedAt: nowIso(),
  };
}

/** Map a 1–5 rating onto −1..1. */
export function ratingToScore(rating: number): number {
  return clamp((rating - 3) / 2, -1, 1);
}

export function applyFeedback(
  model: PreferenceModel,
  feedback: MealFeedback,
  recipe: Recipe,
): PreferenceModel {
  const target = ratingToScore(feedback.rating);
  // Taste is the better signal for ingredients and cuisine; blend it in.
  const tasteTarget = ratingToScore(feedback.taste ?? feedback.rating);
  const blended = clamp(0.6 * target + 0.4 * tasteTarget, -1, 1);

  const recipeScores = { ...model.recipeScores };
  recipeScores[recipe.id] = clamp(
    ema(recipeScores[recipe.id] ?? 0, target, ALPHA),
    -1,
    1,
  );

  const ingredientAffinity = { ...model.ingredientAffinity };
  for (const ri of recipe.ingredients ?? []) {
    ingredientAffinity[ri.ingredientId] = clamp(
      ema(ingredientAffinity[ri.ingredientId] ?? 0, blended, ALPHA),
      -1,
      1,
    );
  }

  const cuisineAffinity = { ...model.cuisineAffinity };
  if (recipe.cuisine) {
    cuisineAffinity[recipe.cuisine] = clamp(
      ema(cuisineAffinity[recipe.cuisine] ?? 0, blended, ALPHA),
      -1,
      1,
    );
  }

  const tagAffinity: Partial<Record<RecipeTag, number>> = { ...model.tagAffinity };
  for (const tag of recipe.tags ?? []) {
    tagAffinity[tag] = clamp(ema(tagAffinity[tag] ?? 0, blended, ALPHA), -1, 1);
  }

  let spiceAdjust = model.spiceAdjust;
  if (feedback.spice === "too_hot") spiceAdjust -= SPICE_STEP;
  else if (feedback.spice === "too_mild") spiceAdjust += SPICE_STEP;
  else spiceAdjust *= 0.9; // "just right" slowly relaxes back to the profile
  spiceAdjust = clamp(spiceAdjust, -1, 1);

  let portionAdjust = model.portionAdjust || 1;
  if (feedback.quantity === "too_little") portionAdjust *= PORTION_TOO_LITTLE;
  else if (feedback.quantity === "too_much") portionAdjust *= PORTION_TOO_MUCH;
  portionAdjust = clamp(portionAdjust, PORTION_MIN, PORTION_MAX);

  return {
    ...model,
    recipeScores,
    ingredientAffinity,
    cuisineAffinity,
    tagAffinity,
    spiceAdjust,
    portionAdjust,
    feedbackCount: model.feedbackCount + 1,
    updatedAt: nowIso(),
  };
}

/** The spice level future plans should aim for. */
export function spiceTargetFor(
  profile: UserProfile,
  model: PreferenceModel,
): SpiceLevel {
  const raw = Math.round(
    clamp((profile.spiceLevel || 3) + 2 * (model?.spiceAdjust ?? 0), 1, 5),
  );
  return raw as SpiceLevel;
}

/** Pure affinity score in roughly −1..1; used for ordering recommendations. */
export function affinityScore(recipe: Recipe, model: PreferenceModel): number {
  const recipeScore = clamp(model.recipeScores?.[recipe.id] ?? 0, -1, 1);
  const ingredient = mean(
    (recipe.ingredients ?? []).map((ri) =>
      clamp(model.ingredientAffinity?.[ri.ingredientId] ?? 0, -1, 1),
    ),
  );
  const cuisine = clamp(model.cuisineAffinity?.[recipe.cuisine] ?? 0, -1, 1);
  const tag = mean(
    (recipe.tags ?? []).map((t) => clamp(model.tagAffinity?.[t] ?? 0, -1, 1)),
  );
  return 0.5 * recipeScore + 0.2 * ingredient + 0.15 * cuisine + 0.15 * tag;
}

/**
 * Top `n` recipes the user is most likely to enjoy, after the same hard
 * diet/allergy/equipment filters the planner uses. Ties break on name so the
 * order is stable between renders.
 */
export function recommend(
  recipes: Recipe[],
  model: PreferenceModel,
  profile: UserProfile,
  n = 5,
): Recipe[] {
  return recipes
    .filter((r) => isPlannable(r, profile))
    .map((r) => ({ recipe: r, score: affinityScore(r, model) }))
    .sort((a, b) =>
      b.score === a.score ? a.recipe.name.localeCompare(b.recipe.name) : b.score - a.score,
    )
    .slice(0, Math.max(0, n))
    .map((x) => x.recipe);
}
