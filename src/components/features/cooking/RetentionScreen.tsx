"use client";

import { routes } from "@/lib/routes";
import { ArrowRight, Leaf, TriangleAlert } from "lucide-react";
import { useEffect, useMemo } from "react";
import { AppHeader, Page, StickyFooter } from "@/components/layout";
import {
  Button,
  Card,
  EmptyState,
  ProgressBar,
  SectionHeader,
  Skeleton,
} from "@/components/ui";
import { INGREDIENTS } from "@/lib/data/seed/ingredients";
import { useCookStore, useRecipeStore } from "@/lib/data/stores";
import { useHydrated } from "@/lib/data/storage";
import {
  computeNutritionFromLogs,
  estimateRetention,
  retentionPercent,
} from "@/lib/engines/retention";
import { cn } from "@/lib/utils";

const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RetentionRing({ percent }: { percent: number }) {
  const ratio = Math.max(0, Math.min(1, percent / 100));
  const tone =
    percent < 60 ? "stroke-orange-600" : percent < 75 ? "stroke-amber-600" : "stroke-green-500";
  const text =
    percent < 60 ? "text-orange-600" : percent < 75 ? "text-amber-600" : "text-primary";

  return (
    <div className="relative h-[84px] w-[84px] shrink-0">
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
        <circle cx="42" cy="42" r={RING_RADIUS} fill="none" strokeWidth="7" className="stroke-surface-2" />
        <circle
          cx="42"
          cy="42"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out", tone)}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center text-[20px] font-bold tabular-nums",
          text,
        )}
      >
        {percent}%
      </span>
    </div>
  );
}

export interface RetentionScreenProps {
  sessionId: string;
}

/** Nutrient retention — SCREENS §10. */
export function RetentionScreen({ sessionId }: RetentionScreenProps) {
  const hydrated = useHydrated();
  const session = useCookStore((s) => s.sessions.find((x) => x.id === sessionId));
  const recipe = useRecipeStore((s) =>
    session ? s.recipes.find((r) => r.id === session.recipeId) : undefined,
  );

  const estimate = useMemo(() => {
    if (!session || !recipe) return undefined;
    if (session.retention) return session.retention;
    try {
      return estimateRetention({
        recipe,
        ingredients: INGREDIENTS,
        ingredientLogs: session.ingredientLogs,
        stepLogs: session.stepLogs,
        temperatureHistory: session.temperatureHistory,
        servings: session.servings,
      });
    } catch {
      return undefined;
    }
  }, [session, recipe]);

  // Persist a freshly computed estimate, but only while this session is active
  // (the store's patch actions only touch `activeId`).
  useEffect(() => {
    if (!estimate || !session || session.retention) return;
    if (useCookStore.getState().activeId !== sessionId) return;
    useCookStore.getState().setRetention(estimate);
  }, [estimate, session, sessionId]);

  const cooked = useMemo(() => {
    if (!session || !recipe) return undefined;
    try {
      return computeNutritionFromLogs(
        recipe,
        INGREDIENTS,
        session.ingredientLogs,
        session.servings,
      );
    } catch {
      return undefined;
    }
  }, [session, recipe]);

  if (!hydrated) {
    return (
      <>
        <AppHeader back="/home" title="Nutrient Retention" />
        <Page noNav>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="mt-4 h-52 w-full" />
        </Page>
      </>
    );
  }

  if (!session || !recipe || !estimate) {
    return (
      <>
        <AppHeader back="/home" title="Nutrient Retention" />
        <Page noNav>
          <EmptyState
            emoji="🥗"
            title="No retention estimate"
            description="We could not find this cooking session."
            actionLabel="Back home"
            actionHref="/home"
          />
        </Page>
      </>
    );
  }

  const overall = retentionPercent(estimate.overall);

  return (
    <>
      <AppHeader back="/home" title="Nutrient Retention" />
      <Page noNav>
        <Card padding="md">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-100 text-primary"
                >
                  <Leaf size={18} />
                </span>
                <h2 className="truncate text-[16px] font-bold text-text">Cooking Impact</h2>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-text-2">
                Estimated nutrient retention based on your cooking method, temperature and
                time.
              </p>
            </div>
            <RetentionRing percent={overall} />
          </div>
        </Card>

        <section className="mt-5">
          <SectionHeader title="What survived the pan" caption={recipe.name} />
          <Card padding="md">
            {estimate.nutrients.map((n, i) => {
              const pct = retentionPercent(n);
              return (
                <div key={n.nutrient} className={cn(i > 0 && "mt-4")}>
                  <ProgressBar
                    value={pct}
                    tone="auto"
                    label={n.label}
                    rightLabel={
                      <span className={cn(pct < 60 && "text-orange-600")}>{pct}%</span>
                    }
                  />
                  <p className="mt-1.5 text-[11.5px] text-text-3">{n.note}</p>
                </div>
              );
            })}
            {estimate.nutrients.length === 0 && (
              <p className="text-[13px] text-text-2">
                This dish has too little of the tracked nutrients to report on.
              </p>
            )}
          </Card>
        </section>

        {estimate.warnings.length > 0 && (
          <section className="mt-5">
            <SectionHeader
              title="Worth knowing"
              caption={`${estimate.warnings.length} ${
                estimate.warnings.length === 1 ? "note" : "notes"
              }`}
              captionTone="orange"
            />
            <div className="space-y-2">
              {estimate.warnings.slice(0, 4).map((w, i) => (
                <Card key={`${w.nutrient}-${i}`} tone="orange" padding="sm">
                  <p className="flex items-start gap-2 text-[13px] leading-snug font-semibold text-orange-600">
                    <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
                    {w.message}
                  </p>
                  <p className="mt-1 pl-[23px] text-[12px] leading-relaxed text-text-2">
                    {w.suggestion}
                  </p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {estimate.tips.length > 0 && (
          <Card tone="green" padding="md" className="mt-5">
            <p className="flex items-center gap-2 text-[14px] font-bold text-green-700">
              <Leaf size={16} aria-hidden="true" />
              Tip
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {estimate.tips.slice(0, 3).map((tip) => (
                <li key={tip} className="text-[12.5px] leading-relaxed text-green-700">
                  {tip}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {cooked && (
          <section className="mt-5">
            <SectionHeader
              title="What you actually cooked"
              caption={`per serving · ${session.servings} ${
                session.servings === 1 ? "serving" : "servings"
              }`}
            />
            <Card padding="md">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[12px] text-text-2">Calories</p>
                  <p className="text-[18px] leading-tight font-bold text-text tabular-nums">
                    {Math.round(cooked.kcal)}
                    <span className="ml-1 text-[12px] font-medium text-text-2">kcal</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-3 tabular-nums">
                    recipe says {Math.round(recipe.nutritionPerServing.kcal)} kcal
                  </p>
                </div>
                <div>
                  <p className="text-[12px] text-text-2">Protein</p>
                  <p className="text-[18px] leading-tight font-bold text-text tabular-nums">
                    {Math.round(cooked.proteinG)}
                    <span className="ml-1 text-[12px] font-medium text-text-2">g</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-3 tabular-nums">
                    recipe says {Math.round(recipe.nutritionPerServing.proteinG)} g
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-text-3">
                Measured from the {session.ingredientLogs.length} ingredient
                {session.ingredientLogs.length === 1 ? "" : "s"} the dock weighed.
              </p>
            </Card>
          </section>
        )}

        {/* Clearance for the two-line sticky footer. */}
        <div aria-hidden="true" className="h-10" />
      </Page>

      <StickyFooter>
        <Button
          fullWidth
          size="lg"
          rightIcon={<ArrowRight size={18} />}
          href={routes.feedback(sessionId)}
        >
          Rate this meal
        </Button>
        <Button variant="ghost" size="sm" fullWidth className="mt-1" href="/home">
          Skip
        </Button>
      </StickyFooter>
    </>
  );
}
