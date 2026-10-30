"use client";

import { routes } from "@/lib/routes";
import {
  Check,
  ChevronDown,
  EllipsisVertical,
  Lock,
  Repeat2,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Card, Chip, EmojiTile, IconButton } from "@/components/ui";
import { REHEAT_MIN } from "@/lib/engines/constants";
import type { PlannedMeal, Recipe } from "@/lib/types";
import { cn, formatINR, formatMinutes, humanize } from "@/lib/utils";
import { ingredientRows, totalGrams } from "./ingredients";

export interface MealCardProps {
  meal: PlannedMeal;
  recipe: Recipe | undefined;
  /** One-line planner reason ("Uses 2 items expiring soon · 20 min"). */
  reason?: string;
  onToggleLock: () => void;
  onOpenActions: () => void;
  /** Where a leftover comes from, e.g. "Mon lunch". Set only for leftover meals. */
  leftoverFrom?: string;
  /** Later meals this dish is also cooked for, e.g. ["Mon dinner"]. */
  alsoFeeds?: string[];
  /** Portions cooked in one go: this meal plus the leftovers. Defaults to `meal.servings`. */
  cookServings?: number;
}

/** One planned meal on the weekly plan screen. */
export function MealCard({
  meal,
  recipe,
  reason,
  onToggleLock,
  onOpenActions,
  leftoverFrom,
  alsoFeeds,
  cookServings,
}: MealCardProps) {
  const name = recipe?.name ?? "Recipe unavailable";
  const kcal = Math.round(recipe?.nutritionPerServing.kcal ?? 0);
  const isLeftover = leftoverFrom !== undefined;
  const feeds = alsoFeeds ?? [];
  const portions = cookServings ?? meal.servings;
  const minutes = isLeftover
    ? REHEAT_MIN
    : (recipe?.prepTimeMin ?? 0) + (recipe?.cookTimeMin ?? 0);
  const skipped = meal.status === "skipped";

  const [open, setOpen] = useState(false);
  const panelId = useId();
  // A leftover is only reheated, so there is nothing to weigh out for it.
  const rows = useMemo(
    () => (recipe && !isLeftover ? ingredientRows(recipe, portions) : []),
    [recipe, isLeftover, portions],
  );
  const weight = totalGrams(rows);
  const cost = (recipe?.costPerServing ?? 0) * meal.servings;

  return (
    <Card padding="sm" className="relative">
      {recipe && (
        <Link
          href={routes.recipe(recipe.id)}
          aria-label={`${humanize(meal.mealType)}: ${name}`}
          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      )}

      <div className="flex items-center gap-3">
        <EmojiTile
          emoji={recipe?.emoji}
          imageUrl={recipe?.imageUrl}
          alt={name}
          size={64}
          tone={meal.mealType === "breakfast" ? "orange" : "green"}
        />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-wide text-text-3 uppercase">
            {humanize(meal.mealType)}
          </p>
          <p
            className={cn(
              "truncate text-[16px] leading-tight font-bold text-text",
              skipped && "text-text-3 line-through",
            )}
          >
            {name}
          </p>
          <p className="mt-0.5 text-xs text-text-2">
            {kcal} kcal • {isLeftover ? `Reheat ${formatMinutes(minutes)}` : formatMinutes(minutes)}
            {meal.servings !== 1 && ` • ${meal.servings} servings`}
            {cost > 0 && ` • ${formatINR(cost)}`}
          </p>

          {(isLeftover || feeds.length > 0) && meal.status === "planned" && (
            <div className="mt-1.5">
              <Chip
                tone={isLeftover ? "blue" : "green"}
                size="sm"
                icon={<Repeat2 size={11} strokeWidth={3} />}
              >
                {isLeftover ? `Leftover from ${leftoverFrom}` : "Cook once, eat twice"}
              </Chip>
            </div>
          )}

          {reason && meal.status === "planned" && !isLeftover && (
            <p className="mt-1 truncate text-[11px] text-text-3">{reason}</p>
          )}
          {isLeftover && meal.status === "planned" && (
            <p className="mt-1 truncate text-[11px] text-text-3">
              Already cooked. Warm it up, nothing to chop.
            </p>
          )}

          {(meal.status === "cooked" || meal.status === "eating_out") && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {meal.status === "cooked" && (
                <Chip tone="green" size="sm" icon={<Check size={11} strokeWidth={3} />}>
                  {isLeftover ? "Eaten" : "Cooked"}
                </Chip>
              )}
              {meal.status === "eating_out" && (
                <Chip tone="neutral" size="sm">
                  Eating out
                </Chip>
              )}
            </div>
          )}
        </div>

        <div className="relative z-10 flex shrink-0 flex-col items-center gap-0.5">
          <IconButton
            aria-label={meal.locked ? `Unlock ${name}` : `Lock ${name}`}
            aria-pressed={meal.locked}
            size={36}
            variant={meal.locked ? "soft" : "plain"}
            onClick={onToggleLock}
          >
            {meal.locked ? <Lock size={16} /> : <Unlock size={16} />}
          </IconButton>
          <IconButton
            aria-label={`More options for ${name}`}
            size={36}
            onClick={onOpenActions}
          >
            <EllipsisVertical size={18} />
          </IconButton>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="relative z-10 mt-2 border-t border-border pt-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((v) => !v)}
            className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-lg px-1 text-left text-[13px] font-semibold text-text-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span>
              Ingredients · {rows.length} items · {weight} g
              {feeds.length > 0 && ` · for ${portions} portions`}
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={cn("shrink-0 transition-transform", open && "rotate-180")}
            />
          </button>

          {open && (
            <div id={panelId} className="px-1 pb-1">
              {feeds.length > 0 && (
                <p className="mb-1.5 text-xs text-text-2">
                  Cook {portions} portions now: {meal.servings} for this meal, the rest for{" "}
                  {feeds.join(" and ")}.
                </p>
              )}
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li
                    key={row.ingredientId}
                    className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]"
                  >
                    <span className="min-w-0 truncate text-text">
                      {row.name}
                      {row.optional && <span className="text-text-3"> (optional)</span>}
                    </span>
                    <span className="shrink-0 font-semibold text-text tabular-nums">
                      {row.amount}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
