"use client";

import { routes } from "@/lib/routes";
import { ChevronRight, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { AppHeader, Page } from "@/components/layout";
import {
  Button,
  Card,
  Chip,
  EmojiTile,
  EmptyState,
  ListRow,
  ProgressBar,
  Skeleton,
  SkeletonRow,
} from "@/components/ui";
import {
  expiringSummary,
  expiringUsageStats,
  recipesUsingExpiring,
} from "@/lib/data/selectors";
import { useHydrated } from "@/lib/data/storage";
import { useCookStore, usePantryStore, useRecipeStore } from "@/lib/data/stores";
import { formatExpiry, formatMinutes } from "@/lib/utils";

/**
 * Expiry window for this screen. SCREENS §14 shows "3 ingredients expiring
 * soon" against the demo pantry, which is `daysUntil <= 3` — the same window
 * Home's bell and Pantry Alerts use.
 */
const EXPIRING_DAYS = 3;

/** Rows shown before "View More Recipes". */
const INITIAL_ROWS = 5;

export function ExpiringScreen() {
  const hydrated = useHydrated();
  const pantry = usePantryStore((s) => s.items);
  const recipes = useRecipeStore((s) => s.recipes);
  const sessions = useCookStore((s) => s.sessions);
  const [showAll, setShowAll] = useState(false);

  const summary = useMemo(
    () => expiringSummary(pantry, EXPIRING_DAYS),
    [pantry],
  );
  const matches = useMemo(
    () => recipesUsingExpiring(recipes, pantry, EXPIRING_DAYS),
    [recipes, pantry],
  );
  const stats = useMemo(
    () => expiringUsageStats(sessions, pantry, { days: EXPIRING_DAYS }),
    [sessions, pantry],
  );

  const visible = showAll ? matches : matches.slice(0, INITIAL_ROWS);
  const statsPct = stats.total > 0 ? (stats.used / stats.total) * 100 : 0;

  return (
    <>
      <AppHeader back title="Use Expiring Items" />
      <Page noNav>
        {!hydrated ? (
          <div className="space-y-4">
            <Skeleton className="h-24 rounded-2xl" />
            {[0, 1, 2, 3].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : summary.count === 0 ? (
          <EmptyState
            emoji="🥬"
            title="Your pantry is fresh 🎉"
            description="Nothing is expiring in the next few days. We'll nudge you when something is."
            actionLabel="Back to pantry"
            actionHref="/pantry"
          />
        ) : (
          <div className="space-y-5">
            <Card tone="orange">
              <p className="flex items-start gap-2 text-[14px] leading-relaxed text-text">
                <Info
                  size={18}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-orange-600"
                />
                <span>
                  You have{" "}
                  <span className="font-bold">{summary.count}</span>{" "}
                  ingredient{summary.count === 1 ? "" : "s"} expiring soon. Here are
                  some recipe suggestions:
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.items.map((item) => (
                  <Chip key={item.id} tone="orange" size="sm">
                    {item.name} · {formatExpiry(item.expiresAt)}
                  </Chip>
                ))}
              </div>
            </Card>

            <section aria-label="Recipe suggestions">
              {matches.length === 0 ? (
                <EmptyState
                  emoji="🍲"
                  title="No matching recipes"
                  description="None of the catalog recipes use these ingredients — try adding them to a meal yourself."
                  actionLabel="Open meal plan"
                  actionHref="/plan"
                />
              ) : (
                <>
                  <ul>
                    {visible.map(({ recipe, expiringUsed }, index) => (
                      <li key={recipe.id}>
                        <ListRow
                          href={routes.recipe(recipe.id)}
                          divider={index < visible.length - 1}
                          aria-label={`${recipe.name}, uses ${expiringUsed.length} expiring items`}
                          leading={
                            <EmojiTile
                              emoji={recipe.emoji}
                              imageUrl={recipe.imageUrl}
                              size={64}
                              tone="orange"
                            />
                          }
                          title={recipe.name}
                          subtitle={
                            <>
                              <span className="block font-medium text-orange-600">
                                Uses {expiringUsed.length} expiring item
                                {expiringUsed.length === 1 ? "" : "s"}
                              </span>
                              <span className="block text-text-2">
                                {formatMinutes(
                                  recipe.prepTimeMin + recipe.cookTimeMin,
                                )}{" "}
                                •{" "}
                                {Math.round(recipe.nutritionPerServing.kcal ?? 0)} kcal
                              </span>
                            </>
                          }
                          trailing={
                            <ChevronRight
                              size={18}
                              aria-hidden="true"
                              className="text-text-3"
                            />
                          }
                        />
                      </li>
                    ))}
                  </ul>

                  {!showAll && matches.length > INITIAL_ROWS && (
                    <Button
                      fullWidth
                      variant="primary"
                      className="mt-4"
                      onClick={() => setShowAll(true)}
                    >
                      View More Recipes
                    </Button>
                  )}
                </>
              )}
            </section>

            <Card>
              <p className="text-[14px] font-semibold text-text">{stats.label}</p>
              <ProgressBar
                className="mt-2"
                value={statsPct}
                tone="green"
                aria-label="Expiring items used this month"
              />
              <p className="mt-2 text-[12px] text-text-2">
                Cooking a suggestion above moves the needle.
              </p>
            </Card>
          </div>
        )}
      </Page>
    </>
  );
}
