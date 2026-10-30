"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Captures the Chrome/Edge `beforeinstallprompt` event so a screen can offer
 * its own "Add to home screen" button. Renders nothing by design — the UI
 * lives in the screens.
 *
 *   const { canInstall, install } = useInstallPrompt();
 *   {canInstall && <Button onClick={install}>Install Cookwise</Button>}
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

/**
 * The event fires once, often before React mounts, so it is captured at module
 * scope as well as in the hook.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function setDeferred(event: BeforeInstallPromptEvent | null) {
  deferredPrompt = event;
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    setDeferred(e as BeforeInstallPromptEvent);
  });
  window.addEventListener("appinstalled", () => setDeferred(null));
}

/** True when the page is already running as an installed app. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iPhone and iPad run every browser on Safari's engine, which has no install
 * event: the only way in is Share, then "Add to Home Screen". Pure so it can be
 * tested; iPadOS pretends to be a Mac, hence the touch-point check.
 */
export function isIosDevice(userAgent: string, platform = "", touchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return platform === "MacIntel" && touchPoints > 1;
}

function currentDeviceIsIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
}

export interface UseInstallPrompt {
  /** A native install prompt is queued and `install()` will show it. */
  canInstall: boolean;
  /** Shows the prompt. Resolves to true when the user accepted. */
  install(): Promise<boolean>;
  /** iPhone/iPad, not yet installed: show "Share, then Add to Home Screen". */
  iosManualInstall: boolean;
}

export function useInstallPrompt(): UseInstallPrompt {
  // The prompt is an external event source that usually fires before React
  // mounts, so it is read as an external store rather than mirrored into state.
  const canInstall = useSyncExternalStore(
    subscribe,
    () => deferredPrompt !== null && !isStandalone(),
    () => false, // nothing is installable during SSR
  );

  const iosManualInstall = useSyncExternalStore(
    subscribe,
    () => currentDeviceIsIos() && !isStandalone(),
    () => false,
  );

  const install = useCallback(async (): Promise<boolean> => {
    const event = deferredPrompt;
    if (!event) return false;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      // The event can only be used once, accepted or not.
      setDeferred(null);
      return outcome === "accepted";
    } catch {
      setDeferred(null);
      return false;
    }
  }, []);

  return { canInstall, install, iosManualInstall };
}

/** Optional mount point; the hook works without it. Renders nothing. */
export function InstallPrompt() {
  useInstallPrompt();
  return null;
}

export default InstallPrompt;
