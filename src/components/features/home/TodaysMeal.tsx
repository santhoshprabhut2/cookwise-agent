"use client";

import { routes } from "@/lib/routes";
import { ArrowRight, CalendarDays, Clock, Dumbbell, Flame } from "lucide-react";
import { useState } from "react";
import {
  Button,
  Card,
  Chip,
  EmojiTile,
  StatPill,
  StatPillRow,
  useToast,
} from "@/components/ui";
import { usePlanStore } from "@/lib/data/stores";
import type { PlannedMeal, Recipe } from "@/lib/types";
import { humanize, toISODate, weekStartOf } from "@/lib/utils";
import { tagLabel } from "./labels";

/** 36 px green circle with the arrow, overlapping the emoji tile's corner. */
function ArrowBadge() {
  return (
    <span
      aria-hidden="true"
      className="absolute -right-1.5 -bottom-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-fg shadow-card"
    >
      <ArrowRight size={18} />
    </span>
  );
}

export interface TodaysMealCardProps {
  meal: PlannedMeal;
  recipe: Recipe;
}

/** The hero card on Home: the next uncooked meal of the day. */
export function TodaysMealCard({ meal, recipe }: TodaysMealCardProps) {
  const minutes = recipe.prepTimeMin + recipe.cookTimeMin;
  const n = recipe.nutritionPerServing;
  const chip = tagLabel(recipe.tags[0]);

  return (
    <Card href={routes.recipe(recipe.id)} aria-label={`Today's meal: ${recipe.name}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-text-2">
            Today&rsquo;s Meal &middot; {humanize(meal.mealType)}
          </p>
          {chip && (
            <Chip tone="green" size="sm" className="mt-1.5">
              {chip}
            </Chip>
          )}
          <h3 className="mt-1.5 text-[22px] leading-tight font-bold text-text">
            {recipe.name}
          </h3>
        </div>
        <span className="relative mt-0.5 shrink-0">
          <EmojiTile
            emoji={recipe.emoji}
            imageUrl={recipe.imageUrl}
            size={88}
            tone="orange"
          />
          <ArrowBadge />
        </span>
      </div>

      <StatPillRow className="mt-4">
        <StatPill icon={<Clock size={14} />} value={minutes} unit="min" />
        <StatPill icon={<Flame size={14} />} value={Math.round(n.kcal ?? 0)} unit="kcal" />
        <StatPill
          icon={<Dumbbell size={14} />}
          value={`${Math.round(n.proteinG ?? 0)}g`}
          unit="protein"
        />
      </StatPillRow>
    </Card>
  );
}

/** Everything planned for today is already cooked. */
export function AllMealsCookedCard() {
  return (
    <Card tone="green">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="text-[28px]">
          🎉
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold text-text">
            All meals cooked today 🎉
          </h3>
          <p className="mt-0.5 text-xs text-text-2">
            Nothing left on the plan — nice work.
          </p>
        </div>
      </div>
      <Button
        href="/plan"
        variant="soft"
        size="sm"
        className="mt-3"
        rightIcon={<ArrowRight size={14} />}
      >
        View meal plan
      </Button>
    </Card>
  );
}

/** No plan for this week yet — offer to generate one in place. */
export function GeneratePlanCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      await usePlanStore.getState().generate(weekStartOf(toISODate()));
      toast({ title: "Your week is ready", tone: "success" });
    } catch {
      toast({
        title: "Could not generate a plan",
        description: "Please try again in a moment.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600"
        >
          <CalendarDays size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold text-text">
            No plan for this week yet
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-text-2">
            Generate a 7-day plan from your pantry, goals and budget.
          </p>
        </div>
      </div>
      <Button
        fullWidth
        className="mt-3"
        loading={loading}
        onClick={generate}
        rightIcon={loading ? undefined : <ArrowRight size={16} />}
      >
        Generate my week
      </Button>
    </Card>
  );
}

export interface TodaysMealSectionProps {
  meal?: PlannedMeal;
  recipe?: Recipe;
  /** True when the plan has meals for today (even if they are all cooked). */
  hasMealsToday: boolean;
}

export function TodaysMealSection({
  meal,
  recipe,
  hasMealsToday,
}: TodaysMealSectionProps) {
  return (
    <section aria-label="Today's meal">
      {meal && recipe ? (
        <TodaysMealCard meal={meal} recipe={recipe} />
      ) : hasMealsToday ? (
        <AllMealsCookedCard />
      ) : (
        <GeneratePlanCard />
      )}
    </section>
  );
}
