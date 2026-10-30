"use client";

import { Check, Timer } from "lucide-react";
import { Chip, EmojiTile } from "@/components/ui";
import { ingredientById } from "@/lib/data/seed/ingredients";
import { freshBuyLabel } from "@/lib/engines/freshness";
import type { GroceryItem, IngredientCategory, ISODate } from "@/lib/types";
import { cn, formatINR, formatQuantity, parseISODate, toISODate } from "@/lib/utils";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today" or "Wed" for a shopping trip. */
function tripDay(date: ISODate): string {
  return date === toISODate() ? "Today" : WEEKDAY_SHORT[parseISODate(date).getDay()];
}

/** Catalog categories in the order the shopping list shows them. */
export const CATEGORY_ORDER: IngredientCategory[] = [
  "vegetables",
  "fruits",
  "proteins",
  "grains",
  "dairy",
  "legumes",
  "nuts",
  "spices",
  "oils",
  "other",
];

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  vegetables: "Vegetables",
  fruits: "Fruits",
  proteins: "Proteins",
  grains: "Grains",
  dairy: "Dairy",
  legumes: "Legumes",
  nuts: "Nuts",
  spices: "Spices",
  oils: "Oils",
  other: "Other",
};

export function categoryOf(item: GroceryItem): IngredientCategory {
  return ingredientById(item.ingredientId)?.category ?? "other";
}

/** Groups items by catalog category, in `CATEGORY_ORDER`. */
export function groupByCategory(
  items: GroceryItem[],
): { category: IngredientCategory; items: GroceryItem[] }[] {
  const map = new Map<IngredientCategory, GroceryItem[]>();
  for (const item of items) {
    const c = categoryOf(item);
    const list = map.get(c);
    if (list) list.push(item);
    else map.set(c, [item]);
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
    category,
    items: map.get(category) ?? [],
  }));
}

export interface GroceryGroupProps {
  category: IngredientCategory;
  items: GroceryItem[];
  onToggle: (itemId: string) => void;
  /** Tick one shopping trip of a fresh item. */
  onToggleVisit?: (itemId: string, date: ISODate) => void;
}

/**
 * A fresh item (milk, meat, herbs) is bought in several short trips, so it
 * gets one tick per trip instead of one for the whole week.
 */
function FreshItemRow({
  item,
  divider,
  onToggleVisit,
}: {
  item: GroceryItem;
  divider: boolean;
  onToggleVisit?: (itemId: string, date: ISODate) => void;
}) {
  const ingredient = ingredientById(item.ingredientId);
  const fresh = item.fresh;
  if (!fresh) return null;
  return (
    <div className={cn("px-3 py-2.5", divider && "border-t border-border")}>
      <div className="flex items-center gap-3">
        <EmojiTile emoji={ingredient?.emoji} alt={item.name} size={40} tone="neutral" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-text">{item.name}</p>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Chip tone="orange" size="sm" icon={<Timer size={11} strokeWidth={3} />}>
              Buy fresh · {freshBuyLabel(fresh.everyDays)}
            </Chip>
            <span className="text-xs text-text-2">
              {formatQuantity(item.quantity, item.unit)} in {fresh.visits.length}{" "}
              {fresh.visits.length === 1 ? "trip" : "trips"}
            </span>
          </span>
        </div>
        <span className="shrink-0 text-[13px] font-semibold text-text-2">
          {formatINR(item.estimatedCost)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 pl-[52px]">
        {fresh.visits.map((v) => (
          <button
            key={v.date}
            type="button"
            role="checkbox"
            aria-checked={Boolean(v.purchased)}
            aria-label={`${item.name}, ${tripDay(v.date)}, ${formatQuantity(v.quantity, item.unit)}`}
            onClick={() => onToggleVisit?.(item.id, v.date)}
            className={cn(
              "flex h-11 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-medium",
              "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              v.purchased
                ? "border-primary bg-primary text-primary-fg"
                : "border-border bg-surface text-text-2 active:bg-surface-2",
            )}
          >
            {v.purchased && <Check size={13} strokeWidth={3} aria-hidden="true" />}
            <span>{tripDay(v.date)}</span>
            <span className={v.purchased ? "opacity-90" : "text-text-3"}>
              {formatQuantity(v.quantity, item.unit)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** One category block of the grocery list. */
export function GroceryGroup({ category, items, onToggle, onToggleVisit }: GroceryGroupProps) {
  const purchased = items.filter((i) => i.purchased).length;

  return (
    <section className="mt-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-wide text-text-2 uppercase">
          {CATEGORY_LABELS[category]}
        </h2>
        <span className="text-[11px] text-text-3">
          {purchased}/{items.length}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {items.map((item, i) => {
          if (item.fresh) {
            return (
              <FreshItemRow
                key={item.id}
                item={item}
                divider={i > 0}
                onToggleVisit={onToggleVisit}
              />
            );
          }
          const ingredient = ingredientById(item.ingredientId);
          return (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={item.purchased}
              aria-label={`${item.name}, ${formatQuantity(item.quantity, item.unit)}`}
              onClick={() => onToggle(item.id)}
              className={cn(
                "flex w-full min-h-[56px] items-center gap-3 px-3 py-2 text-left",
                "transition-colors duration-150 active:bg-surface-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                i > 0 && "border-t border-border",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border transition-colors",
                  item.purchased
                    ? "border-primary bg-primary text-primary-fg"
                    : "border-border bg-surface",
                )}
              >
                {item.purchased && <Check size={14} strokeWidth={3} />}
              </span>

              <EmojiTile
                emoji={ingredient?.emoji}
                alt={item.name}
                size={40}
                tone="neutral"
                className={cn(item.purchased && "opacity-50")}
              />

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[15px] font-semibold",
                    item.purchased ? "text-text-3 line-through" : "text-text",
                  )}
                >
                  {item.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-xs",
                      item.purchased ? "text-text-3" : "text-text-2",
                    )}
                  >
                    {formatQuantity(item.quantity, item.unit)}
                  </span>
                  {item.addedToPantry && (
                    <Chip tone="green" size="sm">
                      In pantry
                    </Chip>
                  )}
                </span>
              </span>

              <span
                className={cn(
                  "shrink-0 text-[13px] font-semibold",
                  item.purchased ? "text-text-3 line-through" : "text-text-2",
                )}
              >
                {formatINR(item.estimatedCost)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
