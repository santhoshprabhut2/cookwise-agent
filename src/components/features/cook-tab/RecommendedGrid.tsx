"use client";

import { routes } from "@/lib/routes";
import { Card, Chip, EmojiTile } from "@/components/ui";
import type { Recipe } from "@/lib/types";
import { humanize } from "@/lib/utils";

export interface RecommendedGridProps {
  recipes: Recipe[];
}

/** Two-column grid of learning-engine recommendations. */
export function RecommendedGrid({ recipes }: RecommendedGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {recipes.map((r) => (
        <Card key={r.id} padding="none" href={routes.recipe(r.id)} className="overflow-hidden">
          <div className="aspect-[5/4] w-full">
            <EmojiTile
              emoji={r.emoji}
              imageUrl={r.imageUrl}
              alt={r.name}
              size="full"
              tone="green"
              emojiClassName="text-[36px]"
              className="rounded-none"
            />
          </div>
          <div className="p-3">
            <p className="line-clamp-2 min-h-[34px] text-[14px] leading-tight font-semibold text-text">
              {r.name}
            </p>
            <p className="mt-0.5 text-[11px] text-text-2">
              {Math.round(r.nutritionPerServing.kcal ?? 0)} kcal ·{" "}
              {r.prepTimeMin + r.cookTimeMin} min
            </p>
            {r.tags[0] && (
              <Chip tone="green" size="sm" className="mt-2">
                {humanize(r.tags[0])}
              </Chip>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
