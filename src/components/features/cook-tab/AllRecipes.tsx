"use client";

import { routes } from "@/lib/routes";
import { useMemo, useState } from "react";
import { Chip, EmojiTile, EmptyState, ListRow, SearchInput } from "@/components/ui";
import { useRecipeStore, type RecipeFilters } from "@/lib/data/stores";
import { humanize } from "@/lib/utils";

const QUICK_MAX_MIN = 20;

type FilterKey =
  | "all"
  | "complete"
  | "mine"
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "quick"
  | "high_protein"
  | "veg";

const FILTERS: { key: FilterKey; label: string; filters: RecipeFilters }[] = [
  { key: "all", label: "All", filters: {} },
  { key: "complete", label: "Complete meals", filters: { complete: true } },
  { key: "mine", label: "My foods", filters: { custom: true } },
  { key: "breakfast", label: "Breakfast", filters: { mealType: "breakfast" } },
  { key: "lunch", label: "Lunch", filters: { mealType: "lunch" } },
  { key: "dinner", label: "Dinner", filters: { mealType: "dinner" } },
  { key: "snack", label: "Snack", filters: { mealType: "snack" } },
  { key: "quick", label: `Quick ≤ ${QUICK_MAX_MIN} min`, filters: { maxMinutes: QUICK_MAX_MIN } },
  { key: "high_protein", label: "High protein", filters: { tag: "high_protein" } },
  { key: "veg", label: "Veg only", filters: { diet: "vegetarian" } },
];

export interface AllRecipesProps {
  /** Rendered above the list; receives the number of matches. */
  renderHeader?: (count: number) => React.ReactNode;
}

/** Search + filter chips over the whole recipe catalog. */
export function AllRecipes({ renderHeader }: AllRecipesProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<FilterKey>("all");

  const recipes = useRecipeStore((s) => s.recipes);
  const search = useRecipeStore((s) => s.search);

  const results = useMemo(() => {
    if (!recipes.length) return [];
    const spec = FILTERS.find((f) => f.key === active)?.filters ?? {};
    return search(query, spec);
  }, [recipes, search, query, active]);

  return (
    <div>
      {renderHeader?.(results.length)}

      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery("")}
        placeholder="Search recipes…"
        aria-label="Search recipes"
      />

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <Chip
            key={f.key}
            selected={active === f.key}
            onClick={() => setActive(f.key)}
          >
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="mt-1">
        {results.length === 0 ? (
          <EmptyState
            emoji="🔍"
            title="No recipes match"
            description="Try another search term or a different filter."
          />
        ) : (
          results.map((r) => (
            <ListRow
              key={r.id}
              divider
              href={routes.recipe(r.id)}
              leading={
                <EmojiTile emoji={r.emoji} imageUrl={r.imageUrl} alt={r.name} size={40} />
              }
              title={r.name}
              subtitle={`${r.prepTimeMin + r.cookTimeMin} min • ${Math.round(
                r.nutritionPerServing.kcal ?? 0,
              )} kcal`}
              trailing={
                r.tags[0] ? (
                  <Chip tone="green" size="sm">
                    {humanize(r.tags[0])}
                  </Chip>
                ) : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
