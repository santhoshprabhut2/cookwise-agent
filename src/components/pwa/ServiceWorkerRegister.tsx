"use client";

import { useEffect } from "react";
import { BASE_PATH, STATIC_EXPORT, withBasePath } from "@/lib/base-path";

/**
 * Registers `/sw.js` (under the base path on GitHub Pages) in production only (a service worker in `next dev` caches
 * stale chunks and makes HMR miserable).
 *
 * When a new worker finishes installing it fires a `cw:sw-updated` window
 * event carrying the waiting registration, so any screen can show an
 * "Update available" toast:
 *
 *   window.addEventListener("cw:sw-updated", (e) => {
 *     const reg = (e as CustomEvent<ServiceWorkerRegistration>).detail;
 *     reg.waiting?.postMessage({ type: "SKIP_WAITING" });
 *   });
 *
 * Render it once, in the root layout. It draws nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;
    let cancelled = false;

    const announce = (reg: ServiceWorkerRegistration) => {
      window.dispatchEvent(
        new CustomEvent<ServiceWorkerRegistration>("cw:sw-updated", { detail: reg }),
      );
    };

    const onUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing || !registration) return;
      const reg = registration;
      installing.addEventListener("statechange", () => {
        // A worker that reaches "installed" while one is already controlling
        // the page is an update, not a first install.
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          announce(reg);
        }
      });
    };

    // A reload after SKIP_WAITING: let the new worker take over cleanly.
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker
      // On a static host the worker also needs to know pages are folders, so
      // it is told through the query string (it cannot read build settings).
      .register(`${withBasePath("/sw.js")}${STATIC_EXPORT ? "?slash=1" : ""}`, {
        scope: `${BASE_PATH}/`,
      })
      .then((reg) => {
        if (cancelled) return;
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) announce(reg);
        reg.addEventListener("updatefound", onUpdateFound);
      })
      .catch(() => {
        // Unsupported browser, private mode, or an insecure origin — the app
        // simply runs without offline support.
      });

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      registration?.removeEventListener("updatefound", onUpdateFound);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}

/** Tell the waiting worker to activate now; the page reloads on takeover. */
export function applyServiceWorkerUpdate(registration: ServiceWorkerRegistration): void {
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}

export default ServiceWorkerRegister;
