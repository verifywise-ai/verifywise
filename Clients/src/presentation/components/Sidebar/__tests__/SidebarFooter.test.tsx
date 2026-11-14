import { vi } from "vitest";
import type { AppModule } from "../../../../application/redux/ui/uiSlice";

let activeModule: AppModule = "main";
vi.mock("../../../../application/hooks/useActiveModule", () => ({
  useActiveModule: () => ({ activeModule, setActiveModule: vi.fn() }),
}));
vi.mock("../../../../application/repository/user.repository", () => ({
  getUserById: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock("../../UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({ open: vi.fn(), openTab: vi.fn() }),
}));
const navigateMock = vi.fn();
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigate: () => navigateMock,
}));

import { fireEvent, screen } from "@testing-library/react";

/**
 * The look is read once when uiStyle loads, so each test loads the footer
 * (and the render helper, which shares its store and theme modules) afresh.
 */
async function load(style: "phase1" | "classic") {
  vi.resetModules();
  if (style === "classic") window.localStorage.setItem("vw-ui-style", "classic");
  else window.localStorage.removeItem("vw-ui-style");
  const { renderWithProviders } = await import("../../../../test/renderWithProviders");
  const { default: SidebarFooter } = await import("../SidebarFooter");
  return () =>
    renderWithProviders(<SidebarFooter collapsed={false} delayedCollapsed={false} isAdmin />);
}

beforeEach(() => {
  activeModule = "main";
  navigateMock.mockClear();
});

afterAll(() => {
  window.localStorage.removeItem("vw-ui-style");
});

describe("SidebarFooter: Management popup", () => {
  it("is hidden in the phase 1 look (the unified sidebar lists its entries)", async () => {
    const render = await load("phase1");
    render();
    expect(screen.queryByRole("button", { name: "Management" })).not.toBeInTheDocument();
    // The rest of the footer stays.
    expect(screen.getByRole("button", { name: "Open user options" })).toBeInTheDocument();
  });

  it("opens Event Tracker and Settings in the classic look", async () => {
    const render = await load("classic");
    render();
    fireEvent.click(screen.getByRole("button", { name: "Management" }));
    expect(screen.getByRole("menuitem", { name: /Event Tracker/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Settings/ }));
    expect(navigateMock).toHaveBeenCalledWith("/settings");
  });

  it.each(["phase1", "classic"] as const)(
    "keeps the super admin Settings entry in the %s look",
    async (style) => {
      activeModule = "super-admin";
      const render = await load(style);
      render();
      expect(screen.queryByRole("button", { name: "Management" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("Settings"));
      expect(navigateMock).toHaveBeenCalledWith("/super-admin/settings");
    },
  );
});
