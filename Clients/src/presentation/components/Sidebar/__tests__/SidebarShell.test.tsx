import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SidebarShell, { SidebarItemRow, SidebarMenuItem } from "../SidebarShell";

// The sidebar footer opens the right-hand helper panel; App.tsx provides it.
vi.mock("../../UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({ open: vi.fn(), openTab: vi.fn() }),
}));

const items: SidebarMenuItem[] = [{ id: "tasks", label: "Tasks", icon: null, path: "/tasks" }];

describe("SidebarShell: pinned footer navigation", () => {
  it("renders no pinned area without footerNav (classic sidebars)", () => {
    renderWithProviders(<SidebarShell topItems={items} showDemoDataButton={false} />);
    expect(screen.queryByTestId("sidebar-footer-nav")).not.toBeInTheDocument();
  });

  it("renders footerNav outside the scrolling menu, before the footer", () => {
    renderWithProviders(
      <SidebarShell
        topItems={items}
        showDemoDataButton={false}
        footerNav={<button type="button">Pinned settings</button>}
      />,
    );
    const pinned = screen.getByTestId("sidebar-footer-nav");
    const pinnedButton = within(pinned).getByRole("button", { name: "Pinned settings" });
    expect(screen.getByRole("navigation")).not.toContainElement(pinnedButton);
    const footerButton = screen.getByRole("button", { name: "Open user options" });
    expect(
      pinned.compareDocumentPosition(footerButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("SidebarItemRow: disabled row wrapper", () => {
  const disabled: SidebarMenuItem = { id: "ext", label: "Extensions", icon: null, disabled: true };

  it("keeps a disabled row with a tooltip full width (unified sidebar)", () => {
    renderWithProviders(
      <SidebarItemRow
        item={disabled}
        isActive={false}
        collapsed={false}
        onClick={() => {}}
        tooltip="Admin access required."
        testId="row"
      />,
    );
    const wrapper = screen.getByTestId("row").parentElement!;
    expect(wrapper.tagName).toBe("SPAN");
    expect(wrapper).toHaveStyle({ display: "block", width: "100%" });
  });

  it("keeps the inline-block wrapper without a tooltip (classic sidebars)", () => {
    renderWithProviders(
      <SidebarItemRow
        item={disabled}
        isActive={false}
        collapsed={false}
        onClick={() => {}}
        testId="row"
      />,
    );
    const wrapper = screen.getByTestId("row").parentElement!;
    expect(wrapper.tagName).toBe("SPAN");
    expect(wrapper.getAttribute("style")).toBe("display: inline-block;");
  });
});
