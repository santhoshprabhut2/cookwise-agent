"use client";

import { routes } from "@/lib/routes";
import { ChevronRight, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AllRecipes, RecommendedGrid, TodayCooking } from "@/components/features/cook-tab";
import { filterPlates } from "@/components/features/foods";
import { AppHeader, Page } from "@/components/layout";
import { Card, EmptyState, SectionHeader, Skeleton, useToast } from "@/components/ui";
import { cookServingsFor, expiringSummary, todaysMeals } from "@/lib/data/selectors";
import { useHydrated } from "@/lib/data/storage";
import {
  useCookStore,
  usePantryStore,
  usePlanStore,
  usePreferenceStore,
  useProfileStore,
  useRecipeStore,
} from "@/lib/data/stores";
import { recommend } from "@/lib/engines/learning";
import type { PlannedMeal, Recipe } from "@/lib/types";
import { toISODate, weekStartOf } from "@/lib/utils";

const RECOMMENDED_COUNT = 6;

export default function CookTabPage() {
  const hydrated = useHydrated();
  const router = useRouter();
  const { toast } = useToast();

  const today = toISODate();
  const plan = usePlanStore((s) => s.currentPlan(weekStartOf(today)));
  const recipes = useRecipeStore((s) => s.recipes);
  const pantry = usePantryStore((s) => s.items);
  const profile = useProfileStore((s) => s.profile);
  const preferences = usePreferenceStore((s) => s.model);

  const [starting, setStarting] = useState(false);

  const meals = useMemo(() => todaysMeals(plan, today), [plan, today]);
  const recipeById = useCallback(
    (id: string) => recipes.find((r) => r.id === id),
    [recipes],
  );

  const expiring = useMemo(() => expiringSummary(pantry), [pantry]);
  const plateCount = useMemo(() => filterPlates(recipes, "all").length, [recipes]);
  const myFoodCount = useMemo(() => recipes.filter((r) => !r.isPublic).length, [recipes]);

  const recommended = useMemo(
    () => (profile ? recommend(recipes, preferences, profile, RECOMMENDED_COUNT) : []),
    [recipes, preferences, profile],
  );

  const startCooking = useCallback(
    (meal: PlannedMeal, recipe: Recipe) => {
      setStarting(true);
      try {
        // A dish that also feeds leftovers is cooked once for every portion.
        const session = useCookStore
          .getState()
          .start(recipe.id, cookServingsFor(plan, meal), meal.id);
        router.push(routes.cook(session.id));
      } catch {
        toast({ title: "Could not start the session", tone: "error" });
        setStarting(false);
      }
    },
    [router, toast, plan],
  );

  const reheat = useCallback(
    (meal: PlannedMeal) => {
      const logged = useCookStore.getState().logLeftover(meal.id);
      toast(
        logged
          ? {
              title: "Leftover logged",
              description: "Counted in today's intake. The pantry is untouched.",
              tone: "success",
            }
          : { title: "Could not log that meal", tone: "error" },
      );
    },
    [toast],
  );

  return (
    <>
      <AppHeader title="Cook" large subtitle="Start a meal or browse the catalog" />
      <Page>
        {!hydrated ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-[200px] rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : (
          <>
            <section>
              <SectionHeader
                title="Today"
                caption={
                  meals.length
                    ? `${meals.length} meal${meals.length === 1 ? "" : "s"} planned`
                    : undefined
                }
                actionLabel="Meal plan"
                actionHref="/plan"
              />
              {meals.length ? (
                <TodayCooking
                  meals={meals}
                  recipeById={recipeById}
                  onStart={startCooking}
                  starting={starting}
                  onReheat={reheat}
                  cookServings={(meal) => cookServingsFor(plan, meal)}
                />
              ) : (
                <EmptyState
                  emoji="📅"
                  title="Nothing planned for today"
                  description="Generate your week and today's meals will show up here."
                  actionLabel="Open the plan"
                  actionHref="/plan"
                />
              )}
            </section>

            <section className="mt-4 grid grid-cols-2 gap-3" aria-label="Meals and your foods">
              <Card href="/meals" padding="sm" tone="green">
                <span aria-hidden="true" className="text-2xl">
                  🍛
                </span>
                <span className="mt-1 block text-[14px] font-semibold text-text">
                  Complete meals
                </span>
                <span className="block text-xs text-text-2">
                  {plateCount} with rice or chapati
                </span>
              </Card>
              <Card href="/foods" padding="sm">
                <span aria-hidden="true" className="text-2xl">
                  🥘
                </span>
                <span className="mt-1 block text-[14px] font-semibold text-text">My foods</span>
                <span className="block text-xs text-text-2">
                  {myFoodCount ? `${myFoodCount} added` : "Add your own dish"}
                </span>
              </Card>
            </section>

            {expiring.count > 0 && (
              <Card
                tone="orange"
                padding="sm"
                href="/expiring"
                className="mt-4 flex items-center gap-3"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600"
                >
                  <Info size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-text">
                    Use expiring items
                  </span>
                  <span className="block truncate text-xs text-orange-600">
                    {expiring.label}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-text-3" aria-hidden="true" />
              </Card>
            )}

            {recommended.length > 0 && (
              <section className="mt-6">
                <SectionHeader
                  title="Recommended for you"
                  caption="Based on what you rated"
                />
                <RecommendedGrid recipes={recommended} />
              </section>
            )}

            <section className="mt-6">
              <AllRecipes
                renderHeader={(count) => (
                  <SectionHeader
                    title="All recipes"
                    caption={`${count} recipe${count === 1 ? "" : "s"}`}
                  />
                )}
              />
            </section>
          </>
        )}
      </Page>
    </>
  );
}
