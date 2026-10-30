"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FeedbackScreen } from "@/components/features/cooking";

function Screen() {
  const id = useSearchParams().get("id") ?? "";
  return <FeedbackScreen sessionId={id} />;
}

/** Meal feedback — SCREENS §11. */
export default function FeedbackPage() {
  return (
    <Suspense>
      <Screen />
    </Suspense>
  );
}
