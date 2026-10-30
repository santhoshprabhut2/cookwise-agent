import { describe, expect, it } from "vitest";
import { isIosDevice } from "../InstallPrompt";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15";

describe("isIosDevice", () => {
  it("recognises an iPhone", () => {
    expect(isIosDevice(IPHONE)).toBe(true);
  });

  it("recognises an iPad that reports itself as a Mac, by its touch screen", () => {
    expect(isIosDevice(MAC, "MacIntel", 5)).toBe(true);
  });

  it("does not mistake a real Mac or an Android phone for an iPhone", () => {
    expect(isIosDevice(MAC, "MacIntel", 0)).toBe(false);
    expect(isIosDevice(ANDROID, "Linux armv8l", 5)).toBe(false);
  });
});
