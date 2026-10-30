"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CookingScreen } from "@/components/features/cooking";

function Screen() {
  const id = useSearchParams().get("id") ?? "";
  return <CookingScreen sessionId={id} />;
}

/**
 * Cooking mode — SCREENS §9. Outside `(tabs)`, so there is no bottom nav.
 * The session id is in `?id=` (see `src/lib/routes.ts`).
 */
export default function CookingModePage() {
  return (
    <Suspense>
      <Screen />
    </Suspense>
  );
}
