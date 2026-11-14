import { vi } from "vitest";

vi.mock("../../../../application/hooks/useActiveModule", () => ({
  useActiveModule: () => ({ activeModule: "super-admin", setActiveModule: vi.fn() }),
}));
let organizationId: number | null = null;
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ organizationId, isSuperAdmin: true }),
}));
vi.mock("../../../components/AppSwitcher", () => ({
  default: (props: { hasOrg?: boolean }) => (
    <div data-testid="app-switcher" data-has-org={String(props.hasOrg)} />
  ),
}));
vi.mock("../../../components/SuperAdminSidebar", () => ({
  default: () => <div data-testid="super-admin-sidebar" />,
}));
vi.mock("../../../components/UnifiedSidebar", () => ({
  default: () => <div data-testid="unified-sidebar" />,
}));

import { screen } from "@testing-library/react";

/** The look is read once when uiStyle loads: load the layout afresh per look. */
async function load(style: "phase1" | "classic") {
  vi.resetModules();
  if (style === "classic") window.localStorage.setItem("vw-ui-style", "classic");
  else window.localStorage.removeItem("vw-ui-style");
  const { renderWithProviders } = await import("../../../../test/renderWithProviders");
  const { default: SuperAdminLayout } = await import("../index");
  return () => renderWithProviders(<SuperAdminLayout />, { route: "/super-admin" });
}

afterAll(() => {
  window.localStorage.removeItem("vw-ui-style");
});

describe.each(["phase1", "classic"] as const)("SuperAdminLayout in the %s look", (style) => {
  it("keeps the app switcher and the super admin sidebar (pure super admin)", async () => {
    organizationId = null;
    const render = await load(style);
    render();
    expect(screen.getByTestId("app-switcher")).toHaveAttribute("data-has-org", "false");
    expect(screen.getByTestId("super-admin-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("unified-sidebar")).not.toBeInTheDocument();
  });

  it("gives an elected super admin the switcher back to the organization", async () => {
    organizationId = 1;
    const render = await load(style);
    render();
    expect(screen.getByTestId("app-switcher")).toHaveAttribute("data-has-org", "true");
  });
});
