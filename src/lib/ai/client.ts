"use client";

/**
 * Browser helpers for the `/api/ai/*` routes.
 *
 * Every function returns a discriminated result and **never throws**, so a
 * caller can always fall back to the local engine:
 *
 *   const res = await aiMealPlan(req, summaries);
 *   const plan = res.ok ? res.data : generateWeekPlan(req, recipes);
 *
 * Only `import type` is used from `./schemas` so neither zod nor the Gemini
 * SDK is pulled into the client bundle.
 */

import { STATIC_EXPORT } from "@/lib/base-path";
import type {
  IdentifyIngredientResult,
  MealPlanRequest,
  PantryItem,
  PlannedMeal,
  ReceiptScanResult,
  Recipe,
  ScheduleChange,
} from "@/lib/types";
import type {
  AiStatus,
  CatalogEntry,
  CookingStateResult,
  RecipeSummary,
} from "./schemas";

export type AiOk<T> = { ok: true; data: T };
export type AiFallback = { ok: false; fallback: true; reason: string };
export type AiResult<T> = AiOk<T> | AiFallback;

export type { CatalogEntry, RecipeSummary };

export interface AiPlanResult {
  meals: PlannedMeal[];
  generatedBy: "gemini";
  dropped: number;
  rationale?: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

function fallback(reason: string): AiFallback {
  return { ok: false, fallback: true, reason };
}

/** Converts a Blob/File to bare base64 (no `data:` prefix). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000; // keep String.fromCharCode off the argument limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * A static export (GitHub Pages) has no server, so there is no `/api` to call.
 * Every helper then returns the fallback straight away and the app uses its
 * local engines, exactly as it does offline or without an API key.
 */
const NO_SERVER = "No server on this host. Using the built-in engine.";

async function postJson<T>(path: string, body: unknown): Promise<AiResult<T>> {
  if (STATIC_EXPORT) return fallback(NO_SERVER);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (res.ok) return { ok: true, data: (await res.json()) as T };

    let reason = `Request failed (${res.status})`;
    try {
      const err = (await res.json()) as { reason?: string; error?: string };
      reason = err.reason ?? err.error ?? reason;
    } catch {
      // Non-JSON error body — keep the status-code message.
    }
    return fallback(reason);
  } catch (e) {
    if (controller.signal.aborted) return fallback("The AI request timed out");
    return fallback(e instanceof Error ? e.message : "Network error");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

let statusCache: Promise<AiStatus> | null = null;

/** `{ gemini, ml }`; cached for the lifetime of the page. */
export async function aiStatus(): Promise<AiStatus> {
  if (STATIC_EXPORT) return { gemini: false, ml: false };
  if (!statusCache) {
    statusCache = fetch("/api/ai/status", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AiStatus>) : { gemini: false, ml: false }))
      .catch(() => ({ gemini: false, ml: false }));
  }
  return statusCache;
}

/** True when the server has a Gemini key configured. Never throws. */
export async function aiAvailable(): Promise<boolean> {
  return (await aiStatus()).gemini;
}

/** Forget the cached status (e.g. after the user comes back online). */
export function resetAiStatusCache(): void {
  statusCache = null;
}

// ---------------------------------------------------------------------------
// Vision
// ---------------------------------------------------------------------------

/** Identify a single ingredient from a photo. Falls back to the manual picker. */
export async function aiIdentify(
  image: Blob,
  catalog: CatalogEntry[],
): Promise<AiResult<IdentifyIngredientResult>> {
  try {
    const imageBase64 = await blobToBase64(image);
    return postJson<IdentifyIngredientResult>("/api/ai/identify", {
      imageBase64,
      mimeType: image.type || "image/jpeg",
      catalog,
    });
  } catch (e) {
    return fallback(e instanceof Error ? e.message : "Could not read the image");
  }
}

/** Extract grocery line items from a receipt photo. Falls back to manual entry. */
export async function aiReceipt(
  image: Blob,
  catalog: CatalogEntry[],
): Promise<AiResult<ReceiptScanResult>> {
  try {
    const imageBase64 = await blobToBase64(image);
    return postJson<ReceiptScanResult>("/api/ai/receipt", {
      imageBase64,
      mimeType: image.type || "image/jpeg",
      catalog,
    });
  } catch (e) {
    return fallback(e instanceof Error ? e.message : "Could not read the image");
  }
}

/** Ask whether the pan matches a step's visual cue. Falls back to manual confirm. */
export async function aiCookingState(
  image: Blob,
  stateCue: string,
  context?: { stepTitle?: string; recipeName?: string },
): Promise<AiResult<CookingStateResult>> {
  try {
    const imageBase64 = await blobToBase64(image);
    return postJson<CookingStateResult>("/api/ai/cooking-state", {
      imageBase64,
      mimeType: image.type || "image/jpeg",
      stateCue,
      ...context,
    });
  } catch (e) {
    return fallback(e instanceof Error ? e.message : "Could not read the image");
  }
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** Compact a full Recipe into the row the planner prompt needs. */
export function toRecipeSummary(r: Recipe): RecipeSummary {
  return {
    id: r.id,
    name: r.name,
    mealTypes: r.mealTypes,
    tags: r.tags,
    kcal: Math.round(r.nutritionPerServing.kcal ?? 0),
    protein: Math.round(r.nutritionPerServing.proteinG ?? 0),
    minutes: r.prepTimeMin + r.cookTimeMin,
    cost: Math.round(r.costPerServing),
    diets: r.diets,
    spiceLevel: r.spiceLevel,
    cuisine: r.cuisine,
    equipment: r.equipment,
    ingredientIds: r.ingredients.map((i) => i.ingredientId),
  };
}

/** Generate a 7-day plan. Falls back to `generateWeekPlan` from the planner engine. */
export async function aiMealPlan(
  req: MealPlanRequest & { planId?: string },
  recipes: RecipeSummary[],
): Promise<AiResult<AiPlanResult>> {
  return postJson<AiPlanResult>("/api/ai/meal-plan", {
    planId: req.planId,
    profile: req.profile,
    weekStart: req.weekStart,
    pantry: req.pantry,
    preferences: req.preferences,
    lockedMeals: req.lockedMeals ?? [],
    changes: req.changes ?? [],
    recipes,
  });
}

/** Re-optimise a plan after a schedule change. Falls back to `adaptPlan`. */
export async function aiAdapt(
  input: {
    plan: { id: string; weekStart: string; meals: PlannedMeal[] };
    change: ScheduleChange;
    profile: MealPlanRequest["profile"];
    pantry: PantryItem[];
    preferences?: MealPlanRequest["preferences"];
  },
  recipes: RecipeSummary[],
): Promise<AiResult<AiPlanResult>> {
  return postJson<AiPlanResult>("/api/ai/adapt", { ...input, recipes });
}

// ---------------------------------------------------------------------------
// ML service
// ---------------------------------------------------------------------------

export interface MlRetentionStep {
  method: string;
  avg_temp_c: number;
  minutes: number;
  max_temp_c?: number;
}

export interface MlRetentionResult {
  nutrients: Record<string, number>;
  overall: number;
  source?: string;
}

/**
 * Optional gradient-boosting retention estimate from the Python service.
 * Falls back to `estimateRetention` in `src/lib/engines/retention.ts`.
 */
export async function mlRetention(
  steps: MlRetentionStep[],
  nutrients?: string[],
): Promise<AiResult<MlRetentionResult>> {
  return postJson<MlRetentionResult>("/api/ml/retention", { steps, nutrients });
}
