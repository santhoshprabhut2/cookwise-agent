import type { Metadata } from "next";
import { Suspense } from "react";
import { EditFoodScreen } from "@/components/features/foods";

export const metadata: Metadata = { title: "Edit food" };

export default function EditFoodPage() {
  return (
    <Suspense>
      <EditFoodScreen />
    </Suspense>
  );
}
