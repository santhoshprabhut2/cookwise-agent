"use client";

import {
  CalendarDays,
  ChefHat,
  Home,
  ShoppingBasket,
  User,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Other routes that belong to this tab, so it stays highlighted on them. */
  alsoActiveFor?: readonly string[];
}

export const NAV_TABS: Tab[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/plan", label: "Plan", icon: CalendarDays },
  { href: "/cook", label: "Cook", icon: ChefHat, alsoActiveFor: ["/meals", "/foods"] },
  { href: "/pantry", label: "Pantry", icon: ShoppingBasket },
  { href: "/profile", label: "Profile", icon: User },
];

export function isTabActive(
  pathname: string,
  href: string,
  alsoActiveFor: readonly string[] = [],
): boolean {
  return [href, ...alsoActiveFor].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

/** Fixed 5-tab bar shown on every route inside the `(tabs)` group. */
export function BottomNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed bottom-0 left-1/2 z-40 w-full max-w-[var(--app-max-width)] -translate-x-1/2",
        "border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <ul className="grid h-[var(--nav-height)] grid-cols-5">
        {NAV_TABS.map(({ href, label, icon: Icon, alsoActiveFor }) => {
          const active = isTabActive(pathname, href, alsoActiveFor);
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1",
                  "transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset",
                  active ? "text-primary" : "text-text-3",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1 w-1 rounded-full transition-colors duration-150",
                    active ? "bg-primary" : "bg-transparent",
                  )}
                />
                <Icon size={22} aria-hidden="true" strokeWidth={active ? 2.3 : 1.9} />
                <span className={cn("text-[10px]", active ? "font-semibold" : "font-medium")}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
