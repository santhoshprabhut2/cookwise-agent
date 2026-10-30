import type { Metadata } from "next";
import { MyFoodsScreen } from "@/components/features/foods";

export const metadata: Metadata = { title: "My foods" };

export default function MyFoodsPage() {
  return <MyFoodsScreen />;
}
