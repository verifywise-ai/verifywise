import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadRadiusPx(style?: "classic") {
  vi.resetModules();
  if (style) window.localStorage.setItem("vw-ui-style", style);
  else window.localStorage.removeItem("vw-ui-style");
  return (await import("../palette")).radiusPx;
}

describe("radiusPx", () => {
  beforeEach(() => {
    window.localStorage.removeItem("vw-ui-style");
  });
  afterEach(() => {
    window.localStorage.removeItem("vw-ui-style");
  });

  it("phase 1 collapses md and lg to 2px", async () => {
    const radiusPx = await loadRadiusPx();
    expect(radiusPx.sm).toBe("2px");
    expect(radiusPx.md).toBe("2px");
    expect(radiusPx.lg).toBe("2px");
  });

  it("classic keeps the 6px and 8px corners", async () => {
    const radiusPx = await loadRadiusPx("classic");
    expect(radiusPx.sm).toBe("4px");
    expect(radiusPx.md).toBe("6px");
    expect(radiusPx.lg).toBe("8px");
  });
});
