import { describe, expect, it } from "vitest";
import { NAV_TABS, isTabActive } from "../BottomNav";

describe("isTabActive", () => {
  it("matches the tab's own route and anything under it", () => {
    expect(isTabActive("/cook", "/cook")).toBe(true);
    expect(isTabActive("/cook/abc", "/cook")).toBe(true);
    expect(isTabActive("/cooking", "/cook")).toBe(false);
  });

  it("also matches the extra routes a tab owns", () => {
    expect(isTabActive("/foods", "/cook", ["/meals", "/foods"])).toBe(true);
    expect(isTabActive("/foods/new", "/cook", ["/meals", "/foods"])).toBe(true);
    expect(isTabActive("/meals", "/cook", ["/meals", "/foods"])).toBe(true);
    expect(isTabActive("/pantry", "/cook", ["/meals", "/foods"])).toBe(false);
  });

  it("keeps the Cook tab lit on the complete meals and My foods screens", () => {
    const cook = NAV_TABS.find((t) => t.href === "/cook")!;
    for (const path of ["/meals", "/foods", "/foods/new", "/foods/custom-1"]) {
      expect(isTabActive(path, cook.href, cook.alsoActiveFor), path).toBe(true);
    }
  });

  it("does not light any other tab on those screens", () => {
    for (const tab of NAV_TABS.filter((t) => t.href !== "/cook")) {
      expect(isTabActive("/foods", tab.href, tab.alsoActiveFor), tab.href).toBe(false);
    }
  });
});
