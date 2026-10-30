"use client";

import { routes } from "@/lib/routes";
import {
  ArrowRight,
  ChefHat,
  Clock,
  Dumbbell,
  Flame,
  ShoppingBasket,
  Utensils,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Page, StickyFooter } from "@/components/layout";
import {
  Button,
  Chip,
  EmptyState,
  SectionHeader,
  Skeleton,
  StatPill,
  StatPillRow,
  Stepper,
  useToast,
} from "@/components/ui";
import { pantryCoverage } from "@/lib/data/selectors";
import {
  useCookStore,
  useGroceryStore,
  usePantryStore,
  usePlanStore,
  useRecipeStore,
} from "@/lib/data/stores";
import { useHydrated } from "@/lib/data/storage";
import { cn, humanize } from "@/lib/utils";
import { IngredientList, formatGrams } from "./IngredientList";
import { NutritionTiles } from "./NutritionTiles";
import { RecipeHero, tagLabel } from "./RecipeHero";
import { StepsPreview } from "./StepsPreview";

function SpiceDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Spice level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            n <= level ? "bg-orange-500" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[13px] text-text-2">{label}</span>
      <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-text">
        {children}
      </span>
    </div>
  );
}

export function RecipeDetailScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const hydrated = useHydrated();

  const recipeId = searchParams.get("id") ?? "";
  const plannedMealId = searchParams.get("meal") ?? undefined;

  const recipe = useRecipeStore((s) => s.recipes.find((r) => r.id === recipeId));
  const pantryItems = usePantryStore((s) => s.items);
  const sessions = useCookStore((s) => s.sessions);
  const plannedMeal = usePlanStore((s) =>
    plannedMealId ? s.mealById(plannedMealId) : undefined,
  );

  const [servingsOverride, setServingsOverride] = useState<number | null>(null);
  const defaultServings = plannedMeal?.servings ?? recipe?.servings ?? 2;
  const servings = servingsOverride ?? defaultServings;

  const coverage = useMemo(
    () => (recipe ? pantryCoverage(recipe, pantryItems, servings) : []),
    [recipe, pantryItems, servings],
  );

  const openSession = useMemo(
    () =>
      sessions.find(
        (s) =>
          s.recipeId === recipeId &&
          (s.status === "verifying" || s.status === "cooking"),
      ),
    [sessions, recipeId],
  );

  if (!hydrated) {
    return (
      <>
        <Skeleton className="h-60 w-full rounded-none" />
        <Page noNav>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-4 h-14 w-full" />
          <Skeleton className="mt-6 h-20 w-full" />
          <Skeleton className="mt-6 h-40 w-full" />
        </Page>
      </>
    );
  }

  if (!recipe) {
    return (
      <Page noNav>
        <EmptyState
          emoji="🍽️"
          title="Recipe not found"
          description="This recipe is not in your catalog any more."
          actionLabel="Browse recipes"
          actionHref="/cook"
        />
      </Page>
    );
  }

  const totalMinutes = recipe.prepTimeMin + recipe.cookTimeMin;
  const nutrition = recipe.nutritionPerServing;
  const missing = coverage.filter((c) => !c.ok && !c.optional);

  const addToGroceryList = () => {
    if (missing.length === 0) {
      toast({
        title: "Nothing to add",
        description: "Your pantry already covers this recipe.",
        tone: "success",
      });
      return;
    }

    const plan = usePlanStore.getState().currentPlan();
    if (!plan) {
      toast({
        title: "Create a plan first",
        description: "Generate your week on the Plan tab to start a grocery list.",
        tone: "warning",
      });
      return;
    }

    const list = useGroceryStore.getState().generateForPlan(plan.id);
    const added = missing.filter((m) =>
      list.items.some((i) => i.ingredientId === m.ingredientId),
    );

    if (added.length === 0) {
      toast({
        title: "Grocery list updated",
        description: `Add ${recipe.name} to your week to shop for its missing items.`,
      });
      return;
    }

    toast({
      title: `Added ${added.length} ${added.length === 1 ? "item" : "items"} to your grocery list`,
      description: added
        .slice(0, 3)
        .map((m) => `${m.name} · ${formatGrams(Math.max(0, m.needGrams - m.haveGrams))}`)
        .join(", "),
      tone: "success",
    });
  };

  const startCooking = () => {
    const session = useCookStore
      .getState()
      .start(recipe.id, servings, plannedMeal?.id ?? plannedMealId);
    router.push(routes.cook(session.id));
  };

  return (
    <>
      <RecipeHero recipe={recipe} />

      <div className="relative z-10 -mt-6 rounded-t-3xl bg-bg">
        <Page noNav>
          <h1 className="text-[24px] leading-tight font-bold text-text">{recipe.name}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-text-2">
            {recipe.description}
          </p>

          <StatPillRow className="mt-4">
            <StatPill icon={<Clock size={14} />} value={totalMinutes} unit="min" />
            <StatPill icon={<Flame size={14} />} value={Math.round(nutrition.kcal)} unit="kcal" />
            <StatPill
              icon={<Dumbbell size={14} />}
              value={`${Math.round(nutrition.proteinG)}g`}
              unit="protein"
            />
          </StatPillRow>

          <section className="mt-6">
            <SectionHeader title="Nutrition" caption="per serving" />
            <NutritionTiles nutrition={nutrition} />
          </section>

          <section className="mt-6">
            <SectionHeader
              title={`Ingredients (${servings} ${servings === 1 ? "serving" : "servings"})`}
              right={
                <Stepper
                  label="Servings"
                  value={servings}
                  onChange={setServingsOverride}
                  min={0.5}
                  max={12}
                  step={0.5}
                />
              }
            />
            <div className="rounded-2xl border border-border bg-surface px-3">
              <IngredientList recipe={recipe} servings={servings} coverage={coverage} />
            </div>
            <Button
              variant="soft"
              size="md"
              fullWidth
              className="mt-3"
              leftIcon={<ShoppingBasket size={16} />}
              onClick={addToGroceryList}
            >
              {missing.length > 0
                ? `Add ${missing.length} missing to grocery list`
                : "Add to Pantry"}
            </Button>
          </section>

          <section className="mt-6">
            <SectionHeader title="Steps" caption={`${recipe.steps.length} steps`} />
            <StepsPreview steps={recipe.steps} />
          </section>

          <section className="mt-6">
            <SectionHeader title="Good to know" />
            <div className="rounded-2xl border border-border bg-surface px-4 py-1">
              <MetaRow label="Difficulty">
                <ChefHat size={14} aria-hidden="true" className="text-text-3" />
                {humanize(recipe.difficulty)}
              </MetaRow>
              <div className="border-t border-border" />
              <MetaRow label="Cuisine">
                <Utensils size={14} aria-hidden="true" className="text-text-3" />
                {tagLabel(recipe.cuisine)}
              </MetaRow>
              <div className="border-t border-border" />
              <MetaRow label="Spice">
                <SpiceDots level={recipe.spiceLevel} />
              </MetaRow>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {recipe.equipment.map((e) => (
                <Chip key={e} tone="neutral" size="sm">
                  {humanize(e)}
                </Chip>
              ))}
              {recipe.tags.slice(1).map((t) => (
                <Chip key={t} tone="green" size="sm">
                  {tagLabel(t)}
                </Chip>
              ))}
            </div>
          </section>
        </Page>
      </div>

      <StickyFooter>
        {openSession ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={startCooking}
            >
              Start over
            </Button>
            <Button
              size="lg"
              className="flex-1"
              rightIcon={<ArrowRight size={18} />}
              onClick={() => router.push(routes.cook(openSession.id))}
            >
              Resume
            </Button>
          </div>
        ) : (
          <Button
            fullWidth
            size="lg"
            rightIcon={<ArrowRight size={18} />}
            onClick={startCooking}
          >
            Start Cooking
          </Button>
        )}
      </StickyFooter>
    </>
  );
}
