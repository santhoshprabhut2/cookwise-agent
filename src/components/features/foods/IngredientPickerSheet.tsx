"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Button,
  Chip,
  EmojiTile,
  EmptyState,
  ListRow,
  SearchInput,
  Sheet,
} from "@/components/ui";
import type { ID, Ingredient, IngredientCategory } from "@/lib/types";
import { humanize } from "@/lib/utils";

const CATEGORIES: IngredientCategory[] = [
  "vegetables",
  "proteins",
  "grains",
  "legumes",
  "dairy",
  "spices",
  "oils",
  "fruits",
  "nuts",
];

export interface IngredientPickerSheetProps {
  open: boolean;
  onClose: () => void;
  ingredients: readonly Ingredient[];
  /** Ids already in the food; tapping one again takes it out. */
  selected: readonly ID[];
  onToggle: (ingredient: Ingredient) => void;
}

/** Searchable ingredient list with a tick per chosen item. */
export function IngredientPickerSheet({
  open,
  onClose,
  ingredients,
  selected,
  onToggle,
}: IngredientPickerSheetProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<IngredientCategory | "all">("all");

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return ingredients.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (!term) return true;
      return (
        i.name.toLowerCase().includes(term) ||
        i.aliases.some((a) => a.toLowerCase().includes(term))
      );
    });
  }, [ingredients, query, category]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add ingredients"
      description={`${selected.length} chosen`}
      footer={
        <Button fullWidth size="lg" onClick={onClose}>
          Done
        </Button>
      }
    >
      <SearchInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery("")}
        placeholder="Search ingredients…"
        aria-label="Search ingredients"
      />

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip selected={category === "all"} onClick={() => setCategory("all")}>
          All
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
            {humanize(c)}
          </Chip>
        ))}
      </div>

      <div className="mt-1 pb-2">
        {results.length === 0 ? (
          <EmptyState
            emoji="🔍"
            title="Nothing matches"
            description="Try another word or clear the filter."
          />
        ) : (
          results.map((i) => {
            const picked = selected.includes(i.id);
            return (
              <ListRow
                key={i.id}
                divider
                onClick={() => onToggle(i)}
                aria-label={`${picked ? "Remove" : "Add"} ${i.name}`}
                leading={<EmojiTile emoji={i.emoji} alt={i.name} size={40} tone="neutral" />}
                title={i.name}
                subtitle={humanize(i.category)}
                trailing={
                  picked ? (
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white"
                    >
                      <Check size={14} />
                    </span>
                  ) : undefined
                }
              />
            );
          })
        )}
      </div>
    </Sheet>
  );
}
