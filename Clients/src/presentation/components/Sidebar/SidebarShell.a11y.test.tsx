import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "../../../../src/test/renderWithProviders";
import SidebarShell, { SidebarMenuItem } from "./SidebarShell";

// The sidebar footer opens the right-hand helper panel; App.tsx provides it.
vi.mock("../UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({ open: vi.fn(), openTab: vi.fn() }),
}));

describe("SidebarShell a11y", () => {
  it("count chip: accessible name contains visible text (WCAG 2.5.3)", async () => {
    const items: SidebarMenuItem[] = [
      {
        id: "tasks",
        label: "Tasks",
        icon: <svg viewBox="0 0 24 24" />,
        path: "/tasks",
        count: 12,
      },
    ];
    const { container } = renderWithProviders(
      <SidebarShell
        topItems={items}
        menuGroups={[]}
        isItemActive={() => false}
        onItemClick={() => {}}
        showDemoDataButton={false}
      />,
    );
    const btn = container.querySelector(".MuiListItemButton-root[aria-label]")!;
    const axe = await import("axe-core");
    const results = await axe.default.run(btn, {
      runOnly: { type: "rule", values: ["label-content-name-mismatch"] },
    });
    expect(results.violations).toEqual([]);
  });
});
