import { render, screen } from "@testing-library/react";
import { TabContext } from "@mui/lab";
import { afterEach, describe, expect, it, vi } from "vitest";

const tabs = [
  { label: "Overview", value: "a", icon: "Layers" as const },
  { label: "Guardrail logs", value: "b" },
  { label: "Details", value: "c", icon: "FileText" as const },
];

async function renderBar(style?: "classic") {
  vi.resetModules();
  if (style) window.localStorage.setItem("vw-ui-style", style);
  else window.localStorage.removeItem("vw-ui-style");
  const { default: TabBar } = await import("../index");
  render(
    <TabContext value="a">
      <TabBar tabs={tabs} activeTab="a" onChange={vi.fn()} />
    </TabContext>,
  );
}

const vwIconIn = (name: string) =>
  screen.getByRole("tab", { name: new RegExp(name, "i") }).querySelector('svg[stroke-width="1.7"]');
const lucideIn = (name: string) =>
  screen.getByRole("tab", { name: new RegExp(name, "i") }).querySelector("svg.lucide");

afterEach(() => window.localStorage.removeItem("vw-ui-style"));

describe("TabBar icons", () => {
  it("phase 1 draws the VerifyWise icon for a mapped label, 15px", async () => {
    await renderBar();
    const svg = vwIconIn("Overview");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("width", "15");
    expect(lucideIn("Overview")).toBeNull();
  });

  it("phase 1 adds no icon to a tab that had none, even with a mapped label", async () => {
    await renderBar();
    const tab = screen.getByRole("tab", { name: /guardrail logs/i });
    expect(tab.querySelector("svg")).toBeNull();
  });

  it("phase 1 keeps the Lucide icon when no icon is mapped", async () => {
    await renderBar();
    expect(lucideIn("Details")).not.toBeNull();
    expect(vwIconIn("Details")).toBeNull();
  });

  it("classic keeps the Lucide icon", async () => {
    await renderBar("classic");
    expect(lucideIn("Overview")).not.toBeNull();
    expect(vwIconIn("Overview")).toBeNull();
  });
});
