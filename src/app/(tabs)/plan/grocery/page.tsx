"use client";

import { PackagePlus, ShoppingBasket } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import { GroceryGroup, groupByCategory, weekRangeLabel } from "@/components/features/plan";
import { AppHeader, Page, StickyFooter } from "@/components/layout";
import {
  Button,
  Card,
  EmptyState,
  ProgressBar,
  Skeleton,
  useToast,
} from "@/components/ui";
import { useHydrated } from "@/lib/data/storage";
import { useGroceryStore, usePlanStore } from "@/lib/data/stores";
import { groceryTotals, pendingPantryCount } from "@/lib/engines/grocery";
import { formatINR, toISODate, weekStartOf } from "@/lib/utils";

function GroceryScreen() {
  const hydrated = useHydrated();
  const { toast } = useToast();
  const params = useSearchParams();

  const weekStart = params.get("week") || weekStartOf(toISODate());
  const plan = usePlanStore((s) => s.currentPlan(weekStart));
  const list = useGroceryStore((s) => (plan ? s.forPlan(plan.id) : undefined));

  const [busy, setBusy] = useState(false);
  const [movedCount, setMovedCount] = useState(0);

  const groups = useMemo(
    () => (list ? groupByCategory(list.items) : []),
    [list],
  );
  const totals = useMemo(
    () => (list ? groceryTotals(list) : undefined),
    [list],
  );

  const pendingPantry = useMemo(() => (list ? pendingPantryCount(list) : 0), [list]);

  const regenerate = useCallback(() => {
    if (!plan) return;
    setBusy(true);
    try {
      useGroceryStore.getState().generateForPlan(plan.id);
      toast({
        title: "Grocery list rebuilt",
        description: "Items you already ticked off stayed ticked.",
        tone: "success",
      });
    } finally {
      setBusy(false);
    }
  }, [plan, toast]);

  const addToPantry = useCallback(() => {
    if (!list) return;
    const added = useGroceryStore.getState().moveToPantry(list.id);
    setMovedCount(added.length);
    toast({
      title: `Added ${added.length} item${added.length === 1 ? "" : "s"} to pantry`,
      description: "Default expiry dates come from the catalog.",
      tone: "success",
    });
  }, [list, toast]);

  const header = (
    <AppHeader
      back="/plan"
      title="Grocery List"
      right={
        hydrated && plan ? (
          <Button variant="ghost" size="sm" loading={busy} onClick={regenerate}>
            Regenerate
          </Button>
        ) : undefined
      }
    />
  );

  if (!hydrated) {
    return (
      <>
        {header}
        <Page>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="mt-4 h-40 rounded-2xl" />
          <Skeleton className="mt-4 h-40 rounded-2xl" />
        </Page>
      </>
    );
  }

  if (!plan) {
    return (
      <>
        {header}
        <Page>
          <EmptyState
            emoji="📅"
            title="No plan for this week"
            description={`Generate a plan for ${weekRangeLabel(weekStart)} first — the grocery list is built from it.`}
            actionLabel="Go to the plan"
            actionHref="/plan"
          />
        </Page>
      </>
    );
  }

  if (!list || list.items.length === 0) {
    return (
      <>
        {header}
        <Page>
          <EmptyState
            emoji="🧺"
            title="No grocery list yet"
            description="We compare the week's recipes with your pantry and list only what is missing."
            actionLabel="Generate grocery list"
            onAction={regenerate}
          />
        </Page>
      </>
    );
  }

  const purchasedPct = totals?.itemCount
    ? Math.round((totals.purchasedCount / totals.itemCount) * 100)
    : 0;

  return (
    <>
      {header}
      <Page>
        <Card padding="md">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"
            >
              <ShoppingBasket size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-text">
                {totals?.itemCount} item{totals?.itemCount === 1 ? "" : "s"} ·{" "}
                {formatINR(totals?.estimatedCost ?? 0)}
              </p>
              <p className="mt-0.5 text-xs text-text-2">
                covers {weekRangeLabel(weekStart)}
              </p>
              {totals && totals.usedCost < totals.estimatedCost * 0.95 && (
                <p className="mt-1 text-xs text-text-2">
                  Only about{" "}
                  <span className="font-semibold text-text">{formatINR(totals.usedCost)}</span>{" "}
                  of this is eaten this week. The rest is rice, oil and spices that last into
                  later weeks.
                </p>
              )}
            </div>
          </div>

          <div className="mt-3">
            <ProgressBar
              value={purchasedPct}
              label={`${totals?.purchasedCount ?? 0} of ${totals?.itemCount ?? 0} bought`}
              rightLabel={`${formatINR(totals?.remainingCost ?? 0)} left`}
              aria-label="Shopping progress"
            />
          </div>
        </Card>

        {movedCount > 0 && (
          <Card tone="green" padding="sm" className="mt-3 flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[13px] text-green-700">
              Added {movedCount} item{movedCount === 1 ? "" : "s"} to your pantry.
            </p>
            <Button size="sm" variant="soft" href="/pantry">
              View pantry
            </Button>
          </Card>
        )}

        {groups.map((g) => (
          <GroceryGroup
            key={g.category}
            category={g.category}
            items={g.items}
            onToggle={(id) => useGroceryStore.getState().togglePurchased(id)}
            onToggleVisit={(id, date) => useGroceryStore.getState().toggleVisit(id, date)}
          />
        ))}
      </Page>

      <StickyFooter withNav>
        <Button
          fullWidth
          size="lg"
          disabled={pendingPantry === 0}
          leftIcon={<PackagePlus size={18} />}
          onClick={addToPantry}
        >
          {pendingPantry > 0
            ? `Add ${pendingPantry} purchased to pantry`
            : "Add purchased to pantry"}
        </Button>
      </StickyFooter>
    </>
  );
}

export default function GroceryPage() {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader back="/plan" title="Grocery List" />
          <Page>
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="mt-4 h-40 rounded-2xl" />
          </Page>
        </>
      }
    >
      <GroceryScreen />
    </Suspense>
  );
}
