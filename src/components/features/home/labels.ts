import type { RecipeTag } from "@/lib/types";

/**
 * Display copy for recipe tags. `humanize()` would give "High protein"; the
 * mockups use title case for these chips ("High Protein", "One Pot").
 */
export const TAG_LABELS: Record<RecipeTag, string> = {
  high_protein: "High Protein",
  quick: "Quick",
  low_cal: "Low Cal",
  high_fiber: "High Fiber",
  budget: "Budget",
  comfort: "Comfort",
  one_pot: "One Pot",
  kid_friendly: "Kid Friendly",
  guest_friendly: "Guest Friendly",
  batch_friendly: "Cook Once, Eat Twice",
  complete_meal: "Complete Meal",
  staple: "Staple",
};

export function tagLabel(tag: RecipeTag | undefined): string | undefined {
  return tag ? TAG_LABELS[tag] : undefined;
}

/** ☀️ before noon, 🌤️ in the afternoon, 🌙 in the evening. */
export function timeEmoji(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "☀️";
  if (h < 17) return "🌤️";
  return "🌙";
}
