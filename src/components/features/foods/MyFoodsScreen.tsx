"use client";

import { routes } from "@/lib/routes";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { AppHeader, Page, StickyFooter } from "@/components/layout";
import {
  Button,
  Card,
  Chip,
  EmojiTile,
  EmptyState,
  IconButton,
  ListRow,
  Skeleton,
} from "@/components/ui";
import { useHydrated } from "@/lib/data/storage";
import { useRecipeStore } from "@/lib/data/stores";
import { foodKindLabel } from "./filters";

/** Foods the user added themselves. */
export function MyFoodsScreen() {
  const hydrated = useHydrated();
  const recipes = useRecipeStore((s) => s.recipes);
  const mine = useMemo(() => recipes.filter((r) => !r.isPublic), [recipes]);

  return (
    <>
      <AppHeader
        back="/cook"
        title="My foods"
        subtitle={hydrated ? `${mine.length} added` : undefined}
        right={
          <IconButton aria-label="Add a food" variant="soft" href="/foods/new">
            <Plus size={20} />
          </IconButton>
        }
      />
      <Page>
        {!hydrated ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : mine.length === 0 ? (
          <EmptyState
            emoji="🥘"
            title="No foods of your own yet"
            description="Add a dish from home with its ingredients and weights. It joins your plan, grocery list and cooking steps like any other recipe."
            actionLabel="Add a food"
            actionHref="/foods/new"
          />
        ) : (
          <>
            <Card tone="green" padding="sm">
              <p className="text-[13px] leading-relaxed text-text-2">
                A dish that needs rice or chapati can be saved with one. Pick one when you add
                it and the plate is complete.
              </p>
            </Card>
            <div className="mt-2">
              {mine.map((r) => (
                <ListRow
                  key={r.id}
                  divider
                  href={routes.editFood(r.id)}
                  leading={
                    <EmojiTile emoji={r.emoji} imageUrl={r.imageUrl} alt={r.name} size={40} />
                  }
                  title={r.name}
                  subtitle={`${r.prepTimeMin + r.cookTimeMin} min • ${Math.round(
                    r.nutritionPerServing.kcal ?? 0,
                  )} kcal • ₹${Math.round(r.costPerServing)}`}
                  trailing={
                    <Chip
                      tone={foodKindLabel(r) === "Needs rice or chapati" ? "orange" : "green"}
                      size="sm"
                    >
                      {foodKindLabel(r)}
                    </Chip>
                  }
                />
              ))}
            </div>
          </>
        )}
      </Page>
      {hydrated && mine.length > 0 && (
        <StickyFooter withNav>
          <Button fullWidth size="lg" href="/foods/new" leftIcon={<Plus size={18} />}>
            Add a food
          </Button>
        </StickyFooter>
      )}
    </>
  );
}
