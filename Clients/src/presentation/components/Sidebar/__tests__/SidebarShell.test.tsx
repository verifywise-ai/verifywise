import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SidebarShell, { SidebarMenuItem } from "../SidebarShell";

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
