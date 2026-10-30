"use client";

import { routes } from "@/lib/routes";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AppHeader, Page, StickyFooter } from "@/components/layout";
import {
  Button,
  Card,
  Chip,
  EmojiTile,
  EmptyState,
  ListRow,
  SearchInput,
  Skeleton,
} from "@/components/ui";
import { useHydrated } from "@/lib/data/storage";
import { useRecipeStore } from "@/lib/data/stores";
import { PLATE_FILTERS, filterPlates, type PlateFilterKey } from "./filters";

/** Every whole plate: a main dish with the rice or chapati that goes with it. */
export function CompleteMealsScreen() {
  const hydrated = useHydrated();
  const recipes = useRecipeStore((s) => s.recipes);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState<PlateFilterKey>("all");

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return filterPlates(recipes, active).filter(
      (r) =>
        !term ||
        r.name.toLowerCase().includes(term) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(term)),
    );
  }, [recipes, active, query]);

  return (
    <>
      <AppHeader
        back="/cook"
        title="Complete meals"
        subtitle={hydrated ? `${results.length} for lunch and dinner` : undefined}
      />
      <Page>
        <Card tone="green" padding="sm">
          <p className="text-[13px] leading-relaxed text-text-2">
            Each one has a main dish and a carb, so lunch and dinner are a full plate and not
            just a curry. The planner picks from these first.
          </p>
        </Card>

        <div className="mt-4">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            placeholder="Search meals or ingredients…"
            aria-label="Search complete meals"
          />
        </div>

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {PLATE_FILTERS.map((f) => (
            <Chip key={f.key} selected={active === f.key} onClick={() => setActive(f.key)}>
              {f.label}
            </Chip>
          ))}
        </div>

        <div className="mt-1">
          {!hydrated ? (
            <Skeleton className="mt-3 h-40 rounded-2xl" />
          ) : results.length === 0 ? (
            <EmptyState
              emoji="🍛"
              title="No meals match"
              description="Try another search or a different filter."
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
                )} kcal • ${Math.round(r.nutritionPerServing.proteinG ?? 0)} g protein`}
                trailing={
                  <Chip tone="neutral" size="sm">
                    ₹{Math.round(r.costPerServing)}
                  </Chip>
                }
              />
            ))
          )}
        </div>
      </Page>
      <StickyFooter withNav>
        <Button
          fullWidth
          size="lg"
          variant="soft"
          href="/foods/new"
          leftIcon={<Plus size={18} />}
        >
          Add your own food
        </Button>
      </StickyFooter>
    </>
  );
}
