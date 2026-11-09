import { describe, it, expect } from "vitest";
import { renderWithProviders } from "../../../../src/test/renderWithProviders";
import SidebarShell, { SidebarMenuItem } from "./SidebarShell";

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
