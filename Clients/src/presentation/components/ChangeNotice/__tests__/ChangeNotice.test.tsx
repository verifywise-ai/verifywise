import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ChangeNotice from "../index";
import { resetViewDecisions } from "../viewDecision";

const mocks = vi.hoisted(() => ({
  isClassicUi: vi.fn(() => false),
  setUiStyle: vi.fn(),
  view: vi.fn(),
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  openGuide: vi.fn(),
}));

vi.mock("../../../themes/uiStyle", () => ({
  isClassicUi: mocks.isClassicUi,
  setUiStyle: mocks.setUiStyle,
}));
vi.mock("../../../../application/hooks/useChangeNotice", () => ({
  useNoticeView: mocks.view,
  useNoticeDismiss: () => ({ mutate: mocks.mutate, mutateAsync: mocks.mutateAsync }),
}));
vi.mock("../../UserGuide/UserGuideSidebarContext", () => ({
  useUserGuideSidebarContext: () => ({ open: mocks.openGuide }),
}));

const GLOBAL_ID = "new-look-2026-11";

/** Answers per notice id; ids not listed are not requested yet (no data). */
function answer(shows: Record<string, boolean>) {
  mocks.view.mockImplementation((id: string | null, enabled: boolean) => {
    if (!id || !enabled || !(id in shows)) return { data: undefined, isError: false };
    return { data: { show: shows[id] }, isError: false };
  });
}

function NavButton({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      go {to}
    </button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isClassicUi.mockReturnValue(false);
  mocks.mutateAsync.mockResolvedValue({ dismissed: true });
  resetViewDecisions();
  localStorage.clear();
  sessionStorage.clear();
  answer({ [GLOBAL_ID]: false, "home-2026-11": true });
});

describe("ChangeNotice", () => {
  it("renders nothing in the classic look", () => {
    mocks.isClassicUi.mockReturnValue(true);
    renderWithProviders(<ChangeNotice />, { route: "/home" });
    expect(screen.queryByTestId("change-notice")).not.toBeInTheDocument();
  });

  it("renders nothing when notices are switched off", () => {
    localStorage.setItem("vw-change-notices", "off");
    renderWithProviders(<ChangeNotice />, { route: "/home" });
    expect(screen.queryByTestId("change-notice")).not.toBeInTheDocument();
  });

  it("renders nothing when the server says show: false", () => {
    answer({ [GLOBAL_ID]: false, "home-2026-11": false });
    renderWithProviders(<ChangeNotice />, { route: "/home" });
    expect(screen.queryByTestId("change-notice")).not.toBeInTheDocument();
  });

  it("renders nothing on a page without an entry", () => {
    renderWithProviders(<ChangeNotice />, { route: "/vendors" });
    expect(screen.queryByTestId("change-notice")).not.toBeInTheDocument();
  });

  it("renders the standard entry's title and three items", () => {
    renderWithProviders(<ChangeNotice />, { route: "/home" });
    expect(screen.getByRole("heading", { name: "Welcome to Home" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByTestId("change-notice-guide")).toBeInTheDocument();
  });

  it("opens the guide article", () => {
    renderWithProviders(<ChangeNotice />, { route: "/home" });
    fireEvent.click(screen.getByTestId("change-notice-guide"));
    expect(mocks.openGuide).toHaveBeenCalledWith("getting-started/home");
  });

  it("dismisses with true, shows Undo, and Undo restores the card", () => {
    renderWithProviders(<ChangeNotice />, { route: "/home" });
    fireEvent.click(screen.getByTestId("change-notice-dismiss"));
    expect(mocks.mutate).toHaveBeenCalledWith({ id: "home-2026-11", dismissed: true });
    expect(screen.queryByTestId("change-notice")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("change-notice-undo"));
    expect(mocks.mutate).toHaveBeenLastCalledWith({ id: "home-2026-11", dismissed: false });
    expect(screen.getByTestId("change-notice")).toBeInTheDocument();
  });

  it("hides the Undo strip after six seconds", () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<ChangeNotice />, { route: "/home" });
      fireEvent.click(screen.getByTestId("change-notice-dismiss"));
      expect(screen.getByTestId("change-notice-undo")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(6100);
      });
      expect(screen.queryByTestId("change-notice-undo")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("swaps the entry when the route changes between two pages", async () => {
    answer({ [GLOBAL_ID]: false, "home-2026-11": true, "ai-gateway-2026-11": true });
    renderWithProviders(
      <>
        <ChangeNotice />
        <NavButton to="/ai-gateway" />
      </>,
      { route: "/home" },
    );
    expect(screen.getByRole("heading", { name: "Welcome to Home" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("go /ai-gateway"));
    expect(
      await screen.findByRole("heading", { name: "AI Gateway is now in the sidebar" }),
    ).toBeInTheDocument();
  });

  describe("Show me", () => {
    beforeEach(() => {
      answer({ [GLOBAL_ID]: false, "ai-gateway-2026-11": true });
    });

    it("is hidden when the target is not in the page", () => {
      renderWithProviders(<ChangeNotice />, { route: "/ai-gateway" });
      expect(screen.getByTestId("change-notice")).toBeInTheDocument();
      expect(screen.queryByTestId("change-notice-show-me")).not.toBeInTheDocument();
    });

    it("is visible when the target is present, and draws a ring on click", async () => {
      renderWithProviders(
        <>
          <div data-testid="nav-item-ai-gateway">AI Gateway</div>
          <ChangeNotice />
        </>,
        { route: "/ai-gateway" },
      );
      const button = await screen.findByTestId("change-notice-show-me");
      fireEvent.click(button);
      expect(await screen.findByTestId("change-notice-ring")).toBeInTheDocument();
      expect(button).toHaveTextContent("Got it");
      fireEvent.click(button);
      await waitFor(() =>
        expect(screen.queryByTestId("change-notice-ring")).not.toBeInTheDocument(),
      );
      expect(mocks.mutate).toHaveBeenCalledWith({ id: "ai-gateway-2026-11", dismissed: true });
      expect(screen.queryByTestId("change-notice")).not.toBeInTheDocument();
      expect(screen.getByTestId("change-notice-undo-strip")).toHaveTextContent("on this page");
    });
  });

  describe("global new look card", () => {
    beforeEach(() => {
      answer({ [GLOBAL_ID]: true, "home-2026-11": true });
    });

    it("takes priority and the page entry is not requested while it shows", () => {
      renderWithProviders(<ChangeNotice />, { route: "/home" });
      expect(
        screen.getByRole("heading", { name: "Welcome to the new look of VerifyWise" }),
      ).toBeInTheDocument();
      expect(mocks.view.mock.calls.some(([id]) => id === "home-2026-11")).toBe(false);
      expect(mocks.view.mock.calls.some(([id]) => id === GLOBAL_ID)).toBe(true);
    });

    it("the X shows the global Undo copy, and Undo restores the global card", () => {
      renderWithProviders(<ChangeNotice />, { route: "/home" });
      fireEvent.click(screen.getByTestId("change-notice-dismiss"));
      expect(mocks.mutate).toHaveBeenCalledWith({ id: GLOBAL_ID, dismissed: true });
      expect(screen.queryByTestId("change-notice")).not.toBeInTheDocument();
      const strip = screen.getByTestId("change-notice-undo-strip");
      expect(strip).toHaveTextContent("You won't see this again.");
      expect(strip).not.toHaveTextContent("on this page");

      fireEvent.click(screen.getByTestId("change-notice-undo"));
      expect(mocks.mutate).toHaveBeenLastCalledWith({ id: GLOBAL_ID, dismissed: false });
      expect(
        screen.getByRole("heading", { name: "Welcome to the new look of VerifyWise" }),
      ).toBeInTheDocument();
    });

    it("Keep the new look dismisses without an Undo strip", () => {
      renderWithProviders(<ChangeNotice />, { route: "/home" });
      fireEvent.click(screen.getByTestId("change-notice-keep"));
      expect(mocks.mutate).toHaveBeenCalledWith({ id: GLOBAL_ID, dismissed: true });
      expect(screen.queryByTestId("change-notice-undo")).not.toBeInTheDocument();
    });

    it("Keep the new look defers the page entry until the next route change", async () => {
      renderWithProviders(
        <>
          <ChangeNotice />
          <NavButton to="/ai-gateway" />
        </>,
        { route: "/home" },
      );
      answer({ [GLOBAL_ID]: true, "home-2026-11": true, "ai-gateway-2026-11": true });
      mocks.view.mockClear();
      fireEvent.click(screen.getByTestId("change-notice-keep"));

      expect(screen.queryByTestId("change-notice")).not.toBeInTheDocument();
      expect(mocks.view.mock.calls.some(([id, enabled]) => id === "home-2026-11" && enabled)).toBe(
        false,
      );
      expect(sessionStorage.getItem("vw-change-notice-requested:home-2026-11")).toBeNull();

      fireEvent.click(screen.getByText("go /ai-gateway"));
      expect(
        await screen.findByRole("heading", { name: "AI Gateway is now in the sidebar" }),
      ).toBeInTheDocument();
      expect(
        mocks.view.mock.calls.some(([id, enabled]) => id === "ai-gateway-2026-11" && enabled),
      ).toBe(true);
    });

    it("Switch back records the dismissal, then switches to the classic look", async () => {
      renderWithProviders(<ChangeNotice />, { route: "/home" });
      fireEvent.click(screen.getByTestId("change-notice-switch-back"));
      await waitFor(() => expect(mocks.setUiStyle).toHaveBeenCalledWith("classic"));
      expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: GLOBAL_ID, dismissed: true });
      expect(mocks.mutateAsync.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.setUiStyle.mock.invocationCallOrder[0],
      );
    });
  });
});
