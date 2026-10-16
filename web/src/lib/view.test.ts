import { describe, expect, it } from "vitest";
import { centeredViewport, fullyVisible } from "./view";

const screen = { left: 0, top: 0, right: 900, bottom: 700 };
const bars = { left: 10, top: 10, right: 500, bottom: 60 };

describe("fullyVisible", () => {
  it("is true for a box inside the area", () => {
    expect(fullyVisible({ left: 100, top: 100, right: 260, bottom: 168 }, screen)).toBe(true);
  });

  it("is false for a box sticking out of any side", () => {
    expect(fullyVisible({ left: 800, top: 100, right: 960, bottom: 168 }, screen)).toBe(false);
    expect(fullyVisible({ left: -20, top: 100, right: 140, bottom: 168 }, screen)).toBe(false);
    expect(fullyVisible({ left: 100, top: 650, right: 260, bottom: 718 }, screen)).toBe(false);
    expect(fullyVisible({ left: 100, top: -5, right: 260, bottom: 63 }, screen)).toBe(false);
  });

  it("is false for a box under the bars over the map", () => {
    expect(fullyVisible({ left: 100, top: 40, right: 260, bottom: 108 }, screen, [bars])).toBe(false);
  });

  it("is true for a box beside or just below the bars", () => {
    expect(fullyVisible({ left: 600, top: 20, right: 760, bottom: 88 }, screen, [bars])).toBe(true);
    expect(fullyVisible({ left: 100, top: 60, right: 260, bottom: 128 }, screen, [bars])).toBe(true);
  });
});

describe("centeredViewport", () => {
  it("puts the point in the middle of the area", () => {
    const view = centeredViewport({ x: 1000, y: 400 }, { left: 0, top: 0, right: 600, bottom: 800 }, 0.5);
    expect(view).toEqual({ x: 300 - 500, y: 400 - 200, zoom: 0.5 });
  });

  it("uses the area's own middle when it doesn't start at the corner", () => {
    // The room below 100 px of bars, on a 900 × 700 map: its middle is at (450, 400).
    const view = centeredViewport({ x: 200, y: 300 }, { left: 0, top: 100, right: 900, bottom: 700 }, 1);
    expect(view.x + 200).toBe(450);
    expect(view.y + 300).toBe(400);
  });
});
