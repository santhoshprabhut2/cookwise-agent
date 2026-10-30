import type { Metadata } from "next";
import { CustomFoodForm } from "@/components/features/foods";

export const metadata: Metadata = { title: "Add a food" };

export default function NewFoodPage() {
  return <CustomFoodForm />;
}
