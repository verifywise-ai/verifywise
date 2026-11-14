import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

async function renderBox(style?: "classic") {
  vi.resetModules();
  if (style) window.localStorage.setItem("vw-ui-style", style);
  else window.localStorage.removeItem("vw-ui-style");
  const { default: InfoBox } = await import("../index");
  const { note, radiusPx } = await import("../../../themes/palette");
  const { container } = render(<InfoBox message="Hello" storageKey="k" />);
  return { box: container.firstElementChild as HTMLElement, note, radiusPx };
}

afterEach(() => window.localStorage.removeItem("vw-ui-style"));

describe("InfoBox note look", () => {
  it("phase 1 uses the amber note tokens, 2px radius and 10px 12px padding", async () => {
    const { box, note, radiusPx } = await renderBox();
    const css = getComputedStyle(box);
    expect(note.bg).toBe("#FFF8E6");
    expect(css.backgroundColor).toBe("rgb(255, 248, 230)");
    expect(css.borderTopColor).toBe("rgb(235, 190, 114)");
    expect(css.borderTopWidth).toBe("1px");
    expect(css.borderRadius).toBe(radiusPx.sm);
    expect(css.padding).toBe("10px 12px");
  });

  it("classic keeps today's banner (paper background, divider border)", async () => {
    const { box } = await renderBox("classic");
    expect(getComputedStyle(box).backgroundColor).not.toBe("rgb(255, 248, 230)");
    expect(getComputedStyle(box).padding).not.toBe("10px 12px");
  });
});
