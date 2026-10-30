"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RetentionScreen } from "@/components/features/cooking";

function Screen() {
  const id = useSearchParams().get("id") ?? "";
  return <RetentionScreen sessionId={id} />;
}

/** Nutrient retention — SCREENS §10. */
export default function RetentionPage() {
  return (
    <Suspense>
      <Screen />
    </Suspense>
  );
}
