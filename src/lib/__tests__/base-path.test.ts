import { afterEach, describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("../base-path");
}

afterEach(() => vi.unstubAllEnvs());

describe("base path", () => {
  it("is the root on a normal server", async () => {
    const m = await load({ NEXT_PUBLIC_BASE_PATH: "", NEXT_PUBLIC_STATIC_EXPORT: "" });
    expect(m.BASE_PATH).toBe("");
    expect(m.STATIC_EXPORT).toBe(false);
    expect(m.withBasePath("/icons/a.png")).toBe("/icons/a.png");
    expect(m.pagePath("/home")).toBe("/home");
  });

  it("prefixes assets and adds trailing slashes to pages on GitHub Pages", async () => {
    const m = await load({
      NEXT_PUBLIC_BASE_PATH: "/cookwise-agent/",
      NEXT_PUBLIC_STATIC_EXPORT: "true",
    });
    expect(m.BASE_PATH).toBe("/cookwise-agent");
    expect(m.withBasePath("/icons/a.png")).toBe("/cookwise-agent/icons/a.png");
    expect(m.withBasePath("sw.js")).toBe("/cookwise-agent/sw.js");
    expect(m.pagePath("/home")).toBe("/cookwise-agent/home/");
    expect(m.pagePath("/")).toBe("/cookwise-agent/");
  });

  it("keeps a trailing slash on a user site served from the root", async () => {
    const m = await load({ NEXT_PUBLIC_BASE_PATH: "", NEXT_PUBLIC_STATIC_EXPORT: "true" });
    expect(m.pagePath("/home")).toBe("/home/");
    expect(m.pagePath("/")).toBe("/");
  });
});
