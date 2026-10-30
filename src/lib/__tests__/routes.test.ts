import { describe, expect, it } from "vitest";
import { routes } from "../routes";

describe("routes", () => {
  it("puts the id in the query string", () => {
    expect(routes.recipe("rajma-chawal")).toBe("/recipes/view?id=rajma-chawal");
    expect(routes.cook("s1")).toBe("/cook/session?id=s1");
    expect(routes.retention("s1")).toBe("/cook/session/retention?id=s1");
    expect(routes.feedback("s1")).toBe("/cook/session/feedback?id=s1");
    expect(routes.editFood("custom-1")).toBe("/foods/edit?id=custom-1");
  });

  it("carries the planned meal when there is one", () => {
    expect(routes.recipe("a", "m1")).toBe("/recipes/view?id=a&meal=m1");
    expect(routes.recipe("a")).not.toContain("meal");
  });

  it("escapes ids so they cannot break the URL", () => {
    expect(routes.recipe("a b&c=d")).toBe("/recipes/view?id=a%20b%26c%3Dd");
    const parsed = new URL(routes.cook("x?y#z"), "https://example.test");
    expect(parsed.searchParams.get("id")).toBe("x?y#z");
    expect(parsed.hash).toBe("");
  });
});
