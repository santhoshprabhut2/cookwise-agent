"use client";

import { Suspense } from "react";
import { Page } from "@/components/layout";
import { Skeleton } from "@/components/ui";
import { RecipeDetailScreen } from "@/components/features/recipe";

function RecipeFallback() {
  return (
    <>
      <Skeleton className="h-60 w-full rounded-none" />
      <Page noNav>
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-4 h-14 w-full" />
      </Page>
    </>
  );
}

/** Recipe detail — SCREENS §8. */
export default function RecipePage() {
  return (
    <Suspense fallback={<RecipeFallback />}>
      <RecipeDetailScreen />
    </Suspense>
  );
}
