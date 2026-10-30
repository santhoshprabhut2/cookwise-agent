"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { AppHeader, Page } from "@/components/layout";
import { EmptyState, Skeleton } from "@/components/ui";
import { useHydrated } from "@/lib/data/storage";
import { useProfileStore, useRecipeStore } from "@/lib/data/stores";
import { customFoodFromRecipe } from "@/lib/engines/custom";
import { CustomFoodForm } from "./CustomFoodForm";

/** Loads one of the user's foods into the form. Built-in recipes cannot be edited. */
export function EditFoodScreen() {
  const params = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const id = params?.id ?? "";
  const recipe = useRecipeStore((s) => s.recipes.find((r) => r.id === id));

  const initial = useMemo(
    () =>
      recipe && !recipe.isPublic
        ? customFoodFromRecipe(recipe, useProfileStore.getState().userId())
        : undefined,
    [recipe],
  );

  if (!hydrated) {
    return (
      <>
        <AppHeader back="/foods" title="Edit food" />
        <Page>
          <Skeleton className="h-48 rounded-2xl" />
        </Page>
      </>
    );
  }

  if (!initial) {
    return (
      <>
        <AppHeader back="/foods" title="Edit food" />
        <Page>
          <EmptyState
            emoji="🔍"
            title={recipe ? "Built-in recipes cannot be edited" : "Food not found"}
            description={
              recipe
                ? "Add your own version from My foods instead."
                : "It may have been deleted."
            }
            actionLabel="Back to My foods"
            actionHref="/foods"
          />
        </Page>
      </>
    );
  }

  return (
    <CustomFoodForm
      key={initial.id}
      initial={initial}
      rebuildsSteps={(recipe?.steps.length ?? 0) > 3}
    />
  );
}
