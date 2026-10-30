"use client";

import { routes } from "@/lib/routes";
import { Bluetooth, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Page } from "@/components/layout";
import {
  Button,
  EmptyState,
  IconButton,
  Sheet,
  Skeleton,
  useToast,
} from "@/components/ui";
import { useCookStore, useRecipeStore } from "@/lib/data/stores";
import { useHydrated } from "@/lib/data/storage";
import { WEB_BLUETOOTH_UNAVAILABLE } from "@/lib/engines/sensor";
import type { Recipe, RecipeStep, StepLog } from "@/lib/types";
import { StepView } from "./StepView";
import { useSensorDock } from "./useSensorDock";
import { VerifyIngredients } from "./VerifyIngredients";

/** Temperature is sampled into the session at most this often. */
const TEMP_SAMPLE_MS = 2000;

function orderedSteps(recipe: Recipe): RecipeStep[] {
  return [...recipe.steps].sort((a, b) => a.order - b.order);
}

/** Resume at the step that was left open, else just after the last finished one. */
function resumeIndex(steps: RecipeStep[], logs: StepLog[]): number {
  const open = logs.find((l) => !l.endedAt);
  if (open) {
    const i = steps.findIndex((s) => s.id === open.stepId);
    if (i >= 0) return i;
  }
  let last = -1;
  for (const log of logs) {
    const i = steps.findIndex((s) => s.id === log.stepId);
    if (i > last) last = i;
  }
  if (last < 0) return 0;
  return Math.min(steps.length - 1, last + 1);
}

function CookingHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack(): void;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex min-h-14 items-center gap-2 px-4 py-2">
        <div className="flex min-w-10 shrink-0 items-center">
          <IconButton aria-label="Leave cooking mode" onClick={onBack} className="-ml-2">
            <ChevronLeft size={22} />
          </IconButton>
        </div>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate text-[17px] font-semibold text-text">{title}</h1>
        </div>
        <div className="flex min-w-10 shrink-0 items-center justify-end gap-1">{right}</div>
      </div>
    </header>
  );
}

export interface CookingScreenProps {
  sessionId: string;
}

/** Cooking mode — SCREENS §9. Phase A verifies, phase B guides the steps. */
export function CookingScreen({ sessionId }: CookingScreenProps) {
  const router = useRouter();
  const { toast } = useToast();
  const hydrated = useHydrated();
  const dock = useSensorDock();

  const session = useCookStore((s) => s.sessions.find((x) => x.id === sessionId));
  const recipe = useRecipeStore((s) =>
    session ? s.recipes.find((r) => r.id === session.recipeId) : undefined,
  );

  const [abandonOpen, setAbandonOpen] = useState(false);

  const steps = useMemo(() => (recipe ? orderedSteps(recipe) : []), [recipe]);

  const tempRef = useRef<number | undefined>(undefined);
  const stepTempsRef = useRef<number[]>([]);
  const resumedRef = useRef(false);

  useEffect(() => {
    tempRef.current = dock.tempC;
  }, [dock.tempC]);

  const status = session?.status;
  const startedAt = session?.startedAt;

  /**
   * The open `StepLog` is the source of truth for "where am I?", so a reload
   * resumes at the right step and Back / Next need no extra state.
   */
  const stepIndex = useMemo(
    () => (steps.length ? resumeIndex(steps, session?.stepLogs ?? []) : 0),
    [steps, session?.stepLogs],
  );

  // Make this session the active one so the store's patch actions apply to it.
  useEffect(() => {
    if (!hydrated || resumedRef.current) return;
    const found = useCookStore.getState().byId(sessionId);
    if (!found) return;
    if (found.status === "verifying" || found.status === "cooking") {
      useCookStore.getState().resume(sessionId);
    }
    resumedRef.current = true;
  }, [hydrated, sessionId]);

  // A finished session has its own screen.
  useEffect(() => {
    if (!hydrated) return;
    if (status === "completed") router.replace(routes.retention(sessionId));
  }, [hydrated, status, sessionId, router]);

  // Sample the pan into the session while the steps are running.
  useEffect(() => {
    if (status !== "cooking" || !startedAt) return;
    const startMs = Date.parse(startedAt);
    const id = setInterval(() => {
      const tempC = tempRef.current;
      if (tempC === undefined) return;
      stepTempsRef.current.push(tempC);
      useCookStore.getState().addTemp({ t: Date.now() - startMs, tempC });
    }, TEMP_SAMPLE_MS);
    return () => clearInterval(id);
  }, [status, startedAt]);

  const endCurrentStep = useCallback((step: RecipeStep) => {
    const log = useCookStore
      .getState()
      .byId(sessionId)
      ?.stepLogs.find((l) => l.stepId === step.id);
    const startMs = log ? Date.parse(log.startedAt) : Number.NaN;
    const summary: Partial<StepLog> = {};
    if (!Number.isNaN(startMs)) {
      summary.durationSec = Math.max(0, Math.round((Date.now() - startMs) / 1000));
    }
    const samples = stepTempsRef.current;
    if (samples.length) {
      summary.avgTempC =
        Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10;
      summary.maxTempC = Math.max(...samples);
    }
    useCookStore.getState().endStep(step.id, summary);
    stepTempsRef.current = [];
  }, [sessionId]);

  const enterStep = useCallback(
    (index: number) => {
      const step = steps[index];
      if (!step) return;
      useCookStore.getState().startStep(step.id);
      // Tare so this step's additions are measured on their own.
      if (step.addIngredients?.length) dock.tare();
      stepTempsRef.current = [];
    },
    [steps, dock],
  );

  const startCooking = useCallback(() => {
    if (!steps.length) return;
    enterStep(0);
  }, [enterStep, steps.length]);

  const goNext = useCallback(() => {
    const current = steps[stepIndex];
    if (current) endCurrentStep(current);
    enterStep(Math.min(steps.length - 1, stepIndex + 1));
  }, [steps, stepIndex, endCurrentStep, enterStep]);

  const goBack = useCallback(() => {
    const current = steps[stepIndex];
    if (current) endCurrentStep(current);
    enterStep(Math.max(0, stepIndex - 1));
  }, [steps, stepIndex, endCurrentStep, enterStep]);

  const finish = useCallback(() => {
    const current = steps[stepIndex];
    if (current) endCurrentStep(current);
    const done = useCookStore.getState().complete();
    toast({ title: "Meal logged", tone: "success" });
    router.replace(routes.retention(done?.id ?? sessionId));
  }, [steps, stepIndex, endCurrentStep, router, sessionId, toast]);

  const connectDock = useCallback(async () => {
    try {
      await dock.connectBluetooth();
      toast({ title: "Sensor dock connected", tone: "success" });
    } catch (err) {
      toast({
        title: "Dock not connected",
        description: err instanceof Error ? err.message : WEB_BLUETOOTH_UNAVAILABLE,
        tone: "warning",
      });
    }
  }, [dock, toast]);

  const abandon = useCallback(() => {
    useCookStore.getState().abandon();
    setAbandonOpen(false);
    router.replace("/cook");
  }, [router]);

  if (!hydrated) {
    return (
      <>
        <CookingHeader title="Cooking Mode" onBack={() => router.replace("/cook")} />
        <Page noNav>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-2 w-full" />
          <Skeleton className="mt-5 h-48 w-full" />
          <Skeleton className="mt-3 h-24 w-full" />
        </Page>
      </>
    );
  }

  if (!session || !recipe) {
    return (
      <>
        <CookingHeader title="Cooking Mode" onBack={() => router.replace("/cook")} />
        <Page noNav>
          <EmptyState
            emoji="🍳"
            title="That cooking session is gone"
            description="It may have been completed on another device, or cleared with the demo data."
            actionLabel="Back to Cook"
            actionHref="/cook"
          />
        </Page>
      </>
    );
  }

  if (session.status === "abandoned") {
    return (
      <>
        <CookingHeader title="Cooking Mode" onBack={() => router.replace("/cook")} />
        <Page noNav>
          <EmptyState
            emoji="🥄"
            title="This session was abandoned"
            description={`Start ${recipe.name} again whenever you are ready.`}
            actionLabel="Back to Cook"
            actionHref="/cook"
          />
        </Page>
      </>
    );
  }

  const verifying = session.status === "verifying";
  const step = steps[stepIndex];

  return (
    <>
      <CookingHeader
        title="Cooking Mode"
        onBack={() => setAbandonOpen(true)}
        right={
          <IconButton
            aria-label="Connect a Bluetooth sensor dock"
            onClick={() => void connectDock()}
          >
            <Bluetooth size={20} className={dock.simulated ? "text-text-2" : "text-primary"} />
          </IconButton>
        }
      />

      {verifying ? (
        <VerifyIngredients
          recipe={recipe}
          session={session}
          dock={dock}
          onStartCooking={startCooking}
        />
      ) : step ? (
        <StepView
          key={step.id}
          recipe={recipe}
          session={session}
          step={step}
          index={stepIndex}
          total={steps.length}
          dock={dock}
          onBack={goBack}
          onNext={goNext}
          onFinish={finish}
        />
      ) : (
        <Page noNav>
          <EmptyState
            emoji="📋"
            title="This recipe has no steps"
            description="Log what you cooked and we will still estimate the nutrient retention."
            actionLabel="Finish cooking"
            onAction={finish}
          />
        </Page>
      )}

      <Sheet
        open={abandonOpen}
        onClose={() => setAbandonOpen(false)}
        title="Stop cooking?"
        description="Your ingredient logs and timings for this session will be discarded."
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={abandon}
            >
              Abandon
            </Button>
            <Button size="lg" className="flex-1" onClick={() => setAbandonOpen(false)}>
              Keep cooking
            </Button>
          </div>
        }
      >
        <p className="pb-2 text-[13px] leading-relaxed text-text-2">
          {recipe.name} · {session.ingredientLogs.length} of {recipe.ingredients.length}{" "}
          ingredients verified.
        </p>
      </Sheet>
    </>
  );
}
