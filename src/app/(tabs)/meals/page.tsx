import type { Metadata } from "next";
import { CompleteMealsScreen } from "@/components/features/foods";

export const metadata: Metadata = { title: "Complete meals" };

export default function CompleteMealsPage() {
  return <CompleteMealsScreen />;
}
