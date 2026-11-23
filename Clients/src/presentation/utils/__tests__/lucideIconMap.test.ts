import { describe, it, expect } from "vitest";
import { Copy, Grid3x3, Radar, ShieldCheck, Sparkles, Activity } from "lucide-react";
import { getLucideIcon } from "../lucideIconMap";

describe("getLucideIcon", () => {
  // The Insights tab of the Vendors page names these four icons for its reports. A name the map
  // does not hold resolves to nothing, and the tab then shows no icon.
  it.each([
    ["Grid3x3", Grid3x3],
    ["Radar", Radar],
    ["Copy", Copy],
    ["ShieldCheck", ShieldCheck],
  ] as const)("resolves %s, which the reports of the vendor insights name", (name, icon) => {
    expect(getLucideIcon(name)).toBe(icon);
  });

  it.each([
    ["Sparkles", Sparkles],
    ["Activity", Activity],
  ] as const)("resolves %s, which a tab of the Vendors page names", (name, icon) => {
    expect(getLucideIcon(name)).toBe(icon);
  });

  it("resolves a name the map does not hold to nothing", () => {
    expect(getLucideIcon("Anchor")).toBeUndefined();
  });
});
