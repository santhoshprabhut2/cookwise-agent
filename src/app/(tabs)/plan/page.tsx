"use client";

import { CalendarSync, Plus, RefreshCw, ShoppingBasket } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DayStrip,
  MealActionsSheet,
  MealCard,
  RecipePickerSheet,
  WeekSummary,
  WeekSwitcher,
  weekRangeLabel,
} from "@/components/features/plan";
import { AppHeader, Page } from "@/components/layout";
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Sheet,
  Skeleton,
  Toggle,
  useToast,
} from "@/components/ui";
import { aiAvailable } from "@/lib/ai/client";
import { INGREDIENTS } from "@/lib/data/seed/ingredients";
import { cookServingsFor, leftoversOf, todaysMeals } from "@/lib/data/selectors";
import { useHydrated } from "@/lib/data/storage";
import {
  usePantryStore,
  usePlanStore,
  usePreferenceStore,
  useProfileStore,
  useRecipeStore,
} from "@/lib/data/stores";
import { expiringStock, explainMeal, type MealSlot } from "@/lib/engines/planner";
import type { ISODate, MealType, PlannedMeal } from "@/lib/types";
import { addDays, parseISODate, toISODate, weekStartOf } from "@/lib/utils";

const MEAL_SLOTS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "lunch" for a meal on the same day as `from`, otherwise "Tue dinner". */
function slotName(meal: PlannedMeal, from: ISODate): string {
  if (meal.date === from) return meal.mealType;
  return `${WEEKDAY_SHORT[parseISODate(meal.date).getDay()]} ${meal.mealType}`;
}

function dayIndexIn(weekStart: ISODate, date: ISODate): number {
  const diff = Math.round(
    (parseISODate(date).getTime() - parseISODate(weekStart).getTime()) / 86_400_000,
  );
  return Math.min(6, Math.max(0, diff));
}

type PickerTarget =
  | { mode: "swap"; mealId: string; mealType: MealType }
  | { mode: "add" };

/** First meal slot of the day that is not planned yet. */
function nextFreeSlot(meals: PlannedMeal[]): MealType {
  const used = new Set(meals.map((m) => m.mealType));
  return MEAL_SLOTS.find((m) => !used.has(m)) ?? "snack";
}

export default function WeeklyPlanPage() {
  const hydrated = useHydrated();
  const { toast } = useToast();

  const today = toISODate();
  const [weekStart, setWeekStart] = useState<ISODate>(() => weekStartOf(today));
  const [selectedDate, setSelectedDate] = useState<ISODate>(today);

  const [useAI, setUseAI] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [regenOpen, setRegenOpen] = useState(false);
  // The sheets keep their subject while they animate out, so the content does
  // not flip to a placeholder during the 220 ms slide.
  const [actionMealId, setActionMealId] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [picker, setPicker] = useState<PickerTarget>({ mode: "add" });
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Bumped on every open so the picker remounts with fresh filters. */
  const [pickerSeq, setPickerSeq] = useState(0);

  const plan = usePlanStore((s) => s.currentPlan(weekStart));
  const recipes = useRecipeStore((s) => s.recipes);
  const profile = useProfileStore((s) => s.profile);
  const pantry = usePantryStore((s) => s.items);
  const preferences = usePreferenceStore((s) => s.model);

  useEffect(() => {
    let alive = true;
    aiAvailable().then((ok) => {
      if (alive) setAiReady(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const recipeById = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes],
  );

  const meals = useMemo(
    () => todaysMeals(plan, selectedDate),
    [plan, selectedDate],
  );

  /** Days whose meals are all cooked get a tick in the day strip. */
  const completedDays = useMemo(() => {
    const done = new Set<ISODate>();
    if (!plan) return done;
    const counts = new Map<ISODate, { total: number; cooked: number }>();
    for (const m of plan.meals) {
      const c = counts.get(m.date) ?? { total: 0, cooked: 0 };
      c.total += 1;
      if (m.status === "cooked") c.cooked += 1;
      counts.set(m.date, c);
    }
    for (const [date, c] of counts) if (c.total > 0 && c.cooked === c.total) done.add(date);
    return done;
  }, [plan]);

  /** One-line planner reason per meal on the selected day. */
  const reasons = useMemo(() => {
    const out = new Map<string, string>();
    if (!profile) return out;
    // Same reference date as the planner uses, so the reason matches the pick.
    const expiring = expiringStock(pantry, today, undefined, INGREDIENTS);
    for (const meal of meals) {
      const recipe = recipeById.get(meal.recipeId);
      if (!recipe) continue;
      const slot: MealSlot = {
        date: meal.date,
        mealType: meal.mealType,
        dayIndex: dayIndexIn(weekStart, meal.date),
      };
      out.set(
        meal.id,
        explainMeal(recipe, slot, {
          profile,
          preferences,
          expiring,
          servings: meal.servings,
        }),
      );
    }
    return out;
  }, [meals, recipeById, profile, preferences, pantry, today, weekStart]);

  const shiftWeek = useCallback(
    (days: number) => {
      const next = addDays(weekStart, days);
      setWeekStart(next);
      setSelectedDate(weekStartOf(today) === next ? today : next);
    },
    [weekStart, today],
  );

  const generate = useCallback(
    async (opts?: { seed?: number }) => {
      setGenerating(true);
      try {
        await usePlanStore.getState().generate(weekStart, { useAI, ...opts });
        toast({
          title: opts?.seed ? "Week regenerated" : "Your week is ready",
          description: opts?.seed
            ? "Locked meals were kept as they were."
            : weekRangeLabel(weekStart),
          tone: "success",
        });
      } catch {
        toast({ title: "Could not build the plan", tone: "error" });
      } finally {
        setGenerating(false);
        setRegenOpen(false);
      }
    },
    [weekStart, useAI, toast],
  );

  const actionMeal = actionMealId
    ? (plan?.meals.find((m) => m.id === actionMealId) ?? undefined)
    : undefined;

  const openPicker = useCallback((next: PickerTarget) => {
    setPicker(next);
    setPickerSeq((n) => n + 1);
    setPickerOpen(true);
  }, []);

  const openActions = useCallback((mealId: string) => {
    setActionMealId(mealId);
    setActionsOpen(true);
  }, []);

  const handlePick = (recipeId: string, pickedType: MealType | "all") => {
    const store = usePlanStore.getState();
    if (picker.mode === "swap") {
      store.swapMeal(picker.mealId, recipeId);
      toast({ title: "Meal swapped", tone: "success" });
    } else if (picker.mode === "add" && plan) {
      const mealType = pickedType === "all" ? nextFreeSlot(meals) : pickedType;
      store.addMeal(
        plan.id,
        selectedDate,
        mealType,
        recipeId,
        profile?.servingsDefault ?? 2,
      );
      toast({ title: "Meal added", tone: "success" });
    }
    setPickerOpen(false);
  };

  const aiToggle = (
    <div className="rounded-2xl border border-border bg-surface p-3 text-left">
      <Toggle
        label="AI-assisted planning"
        showLabel
        checked={useAI && aiReady}
        disabled={!aiReady}
        onChange={setUseAI}
        description={
          aiReady
            ? "Gemini proposes the week; the local planner fills any gaps."
            : "Add a Gemini API key on the server to enable this. The local planner is used either way."
        }
      />
    </div>
  );

  return (
    <>
      <AppHeader
        back="/home"
        title="Weekly Plan"
        right={
          <IconButton
            aria-label="Regenerate this week"
            onClick={() => setRegenOpen(true)}
            disabled={!hydrated || !plan}
          >
            <RefreshCw size={19} />
          </IconButton>
        }
      >
        <div className="px-4 pb-2">
          <WeekSwitcher
            weekStart={weekStart}
            onPrev={() => shiftWeek(-7)}
            onNext={() => shiftWeek(7)}
          />
          <DayStrip
            className="mt-2"
            weekStart={weekStart}
            selected={selectedDate}
            onSelect={setSelectedDate}
            completed={hydrated ? completedDays : undefined}
            today={today}
          />
        </div>
      </AppHeader>

      <Page>
        {!hydrated ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[88px] rounded-2xl" />
            <Skeleton className="h-[88px] rounded-2xl" />
            <Skeleton className="h-[88px] rounded-2xl" />
          </div>
        ) : !plan ? (
          <EmptyState
            emoji="📅"
            title="No plan for this week"
            description={`Generate a 7-day plan for ${weekRangeLabel(weekStart)} from your pantry, goals and budget.`}
          >
            <div className="mt-4 w-full max-w-[320px]">
              <Button
                fullWidth
                size="lg"
                loading={generating}
                onClick={() => generate()}
              >
                Generate my week
              </Button>
              <div className="mt-3">{aiToggle}</div>
            </div>
          </EmptyState>
        ) : (
          <>
            {meals.length === 0 ? (
              <Card padding="md">
                <p className="text-[15px] font-semibold text-text">
                  Nothing planned for this day
                </p>
                <p className="mt-0.5 text-xs text-text-2">
                  Add a meal below, or regenerate the week.
                </p>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {meals.map((meal) => {
                  const source = meal.leftoverOf
                    ? plan.meals.find((m) => m.id === meal.leftoverOf)
                    : undefined;
                  const feeds = leftoversOf(plan, meal.id);
                  return (
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      recipe={recipeById.get(meal.recipeId)}
                      reason={reasons.get(meal.id)}
                      leftoverFrom={source ? slotName(source, meal.date) : undefined}
                      alsoFeeds={
                        feeds.length > 0 ? feeds.map((m) => slotName(m, meal.date)) : undefined
                      }
                      cookServings={feeds.length > 0 ? cookServingsFor(plan, meal) : undefined}
                      onToggleLock={() => {
                        usePlanStore.getState().lockMeal(meal.id, !meal.locked);
                        toast({
                          title: meal.locked ? "Meal unlocked" : "Meal locked",
                          description: meal.locked
                            ? undefined
                            : "It will survive a regenerate.",
                        });
                      }}
                      onOpenActions={() => openActions(meal.id)}
                    />
                  );
                })}
              </div>
            )}

            <Button
              className="mt-4"
              variant="secondary"
              fullWidth
              leftIcon={<Plus size={16} />}
              onClick={() => openPicker({ mode: "add" })}
            >
              Add / Swap Meal
            </Button>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                href="/plan/grocery"
                className="px-3 text-[13px]"
                leftIcon={<ShoppingBasket size={15} />}
              >
                Grocery list
              </Button>
              <Button
                variant="secondary"
                href="/plan/adapt"
                className="px-3 text-[13px]"
                leftIcon={<CalendarSync size={15} />}
              >
                Plans changed?
              </Button>
            </div>

            <div className="mt-5">
              <WeekSummary
                plan={plan}
                recipes={recipes}
                profile={profile}
                pantry={pantry}
              />
            </div>
          </>
        )}
      </Page>

      <Sheet
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        title="Regenerate this week"
        description={`A fresh plan for ${weekRangeLabel(weekStart)}. Locked meals are kept exactly as they are.`}
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setRegenOpen(false)}
            >
              Cancel
            </Button>
            <Button
              fullWidth
              loading={generating}
              onClick={() => generate({ seed: Date.now() })}
            >
              Regenerate
            </Button>
          </div>
        }
      >
        <div className="pb-2">{aiToggle}</div>
      </Sheet>

      <MealActionsSheet
        open={actionsOpen && actionMeal != null}
        onClose={() => setActionsOpen(false)}
        meal={actionMeal}
        recipe={actionMeal ? recipeById.get(actionMeal.recipeId) : undefined}
        onSwap={() => {
          if (!actionMeal) return;
          openPicker({
            mode: "swap",
            mealId: actionMeal.id,
            mealType: actionMeal.mealType,
          });
          setActionsOpen(false);
        }}
        onServingsChange={(servings) => {
          if (!actionMeal) return;
          usePlanStore.getState().updateMeal(actionMeal.id, { servings });
        }}
        onToggleEatingOut={() => {
          if (!actionMeal) return;
          const next = actionMeal.status === "eating_out" ? "planned" : "eating_out";
          usePlanStore.getState().setStatus(actionMeal.id, next);
          toast({
            title: next === "eating_out" ? "Marked as eating out" : "Back on the plan",
          });
          setActionsOpen(false);
        }}
        onRemove={() => {
          if (!actionMeal) return;
          usePlanStore.getState().removeMeal(actionMeal.id);
          toast({ title: "Meal removed" });
          setActionsOpen(false);
        }}
      />

      <RecipePickerSheet
        key={pickerSeq}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={picker.mode === "swap" ? "Swap this meal" : "Add a meal"}
        description={
          picker.mode === "swap"
            ? "Pick a replacement — servings and lock state are kept."
            : "Pick a recipe for the selected day."
        }
        mealType={picker.mode === "swap" ? picker.mealType : nextFreeSlot(meals)}
        onPick={handlePick}
      />
    </>
  );
}
