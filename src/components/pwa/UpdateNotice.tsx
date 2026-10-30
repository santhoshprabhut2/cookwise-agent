"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { applyServiceWorkerUpdate } from "./ServiceWorkerRegister";

/**
 * Shows "a new version is ready" when a fresh service worker has installed and
 * is waiting. Without it a deployed update only reaches the user after every
 * tab is closed. Renders nothing until `ServiceWorkerRegister` announces one.
 */
export function UpdateNotice() {
  const [waiting, setWaiting] = useState<ServiceWorkerRegistration | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const onUpdated = (event: Event) => {
      setWaiting((event as CustomEvent<ServiceWorkerRegistration>).detail ?? null);
    };
    window.addEventListener("cw:sw-updated", onUpdated);
    return () => window.removeEventListener("cw:sw-updated", onUpdated);
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-height)+12px+env(safe-area-inset-bottom))] z-[55] mx-auto w-full max-w-[var(--app-max-width)] px-4"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-raised">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"
        >
          <RefreshCw size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-text">A new version is ready</p>
          <p className="text-xs text-text-2">Refresh to get the latest Cookwise.</p>
        </div>
        <Button
          size="sm"
          variant="soft"
          loading={updating}
          onClick={() => {
            setUpdating(true);
            applyServiceWorkerUpdate(waiting);
          }}
        >
          Refresh
        </Button>
        <Button size="sm" variant="ghost" disabled={updating} onClick={() => setWaiting(null)}>
          Later
        </Button>
      </div>
    </div>
  );
}

export default UpdateNotice;
