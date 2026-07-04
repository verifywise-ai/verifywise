import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SmartPrompt from "../index";
import type { SmartPromptConfig } from "../../../../application/contexts/SmartPrompt.context";

const mockDismissPrompt = vi.fn();
const mockSetDontAskAgain = vi.fn();
let mockActivePrompt: SmartPromptConfig | null = null;

vi.mock("../../../../application/contexts/SmartPrompt.context", () => ({
  useSmartPromptContext: () => ({
    activePrompt: mockActivePrompt,
    dismissPrompt: mockDismissPrompt,
    setDontAskAgain: mockSetDontAskAgain,
    showPrompt: vi.fn(),
    hasDontAskAgain: vi.fn().mockReturnValue(false),
  }),
}));

let mockUserRoleName = "Admin";

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName }),
}));

describe("SmartPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockActivePrompt = null;
    mockUserRoleName = "Admin";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when no activePrompt", () => {
    const { container } = renderWithProviders(<SmartPrompt />);
    expect(container.innerHTML).toBe("");
  });

  it("renders when activePrompt is provided", () => {
    mockActivePrompt = {
      id: "test-1",
      type: "info",
      title: "Test Title",
      message: "Test message content",
    };
    renderWithProviders(<SmartPrompt />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test message content")).toBeInTheDocument();
  });

  it("renders primary action button when provided", () => {
    mockActivePrompt = {
      id: "test-2",
      type: "info",
      title: "Title",
      message: "Message",
      primaryAction: { label: "Confirm", onClick: vi.fn() },
    };
    renderWithProviders(<SmartPrompt />);
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("renders secondary action button when provided", () => {
    mockActivePrompt = {
      id: "test-3",
      type: "info",
      title: "Title",
      message: "Message",
      secondaryAction: { label: "Cancel", onClick: vi.fn() },
    };
    renderWithProviders(<SmartPrompt />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("calls primary action onClick and dismisses", async () => {
    const user = userEvent.setup();
    const primaryOnClick = vi.fn();
    mockActivePrompt = {
      id: "test-4",
      type: "info",
      title: "Title",
      message: "Message",
      primaryAction: { label: "Confirm", onClick: primaryOnClick },
    };
    renderWithProviders(<SmartPrompt />);
    await user.click(screen.getByText("Confirm"));
    expect(primaryOnClick).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockDismissPrompt).toHaveBeenCalledWith("test-4");
    });
  });

  it("calls secondary action onClick and dismisses", async () => {
    const user = userEvent.setup();
    const secondaryOnClick = vi.fn();
    mockActivePrompt = {
      id: "test-5",
      type: "info",
      title: "Title",
      message: "Message",
      secondaryAction: { label: "Cancel", onClick: secondaryOnClick },
    };
    renderWithProviders(<SmartPrompt />);
    await user.click(screen.getByText("Cancel"));
    expect(secondaryOnClick).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockDismissPrompt).toHaveBeenCalledWith("test-5");
    });
  });

  it("dismisses via close button", async () => {
    const user = userEvent.setup();
    mockActivePrompt = { id: "test-6", type: "info", title: "Title", message: "Message" };
    renderWithProviders(<SmartPrompt />);
    await user.click(screen.getByLabelText("Dismiss prompt"));
    await waitFor(() => {
      expect(mockDismissPrompt).toHaveBeenCalledWith("test-6");
    });
  });

  it("shows dont-ask-again checkbox when dontAskAgainKey is provided", () => {
    mockActivePrompt = {
      id: "test-7",
      type: "info",
      title: "Title",
      message: "Message",
      dontAskAgainKey: "test_key",
    };
    renderWithProviders(<SmartPrompt />);
    expect(screen.getByText("Don't ask me again")).toBeInTheDocument();
  });

  it("sets dontAskAgain when checkbox is checked and dismissed", () => {
    const onDontAskAgain = vi.fn();
    mockActivePrompt = {
      id: "test-8",
      type: "info",
      title: "Title",
      message: "Message",
      dontAskAgainKey: "test_key",
      onDontAskAgain,
    };
    renderWithProviders(<SmartPrompt />);
    expect(screen.getByText("Don't ask me again")).toBeInTheDocument();
    expect(screen.getByLabelText("Dismiss prompt")).toBeInTheDocument();
  });

  it("disables governance-os-enable primary button for non-admin", () => {
    mockUserRoleName = "Editor";
    const onClick = vi.fn();
    mockActivePrompt = {
      id: "test-9",
      type: "governance-os-enable",
      title: "Enable Governance OS",
      message: "Message",
      primaryAction: { label: "Enable", onClick },
    };
    renderWithProviders(<SmartPrompt />);
    const btn = screen.getByText("Enable").closest("button");
    expect(btn).toBeDisabled();
  });

  it("auto-dismisses after timeout", () => {
    vi.useFakeTimers();
    mockActivePrompt = { id: "test-10", type: "info", title: "Title", message: "Message" };
    renderWithProviders(<SmartPrompt />);
    act(() => {
      vi.advanceTimersByTime(10200);
    });
    expect(mockDismissPrompt).toHaveBeenCalledWith("test-10");
  });

  it("uses custom autoDismissMs when provided", () => {
    vi.useFakeTimers();
    mockActivePrompt = {
      id: "test-11",
      type: "info",
      title: "Title",
      message: "Message",
      autoDismissMs: 5000,
    };
    renderWithProviders(<SmartPrompt />);
    act(() => {
      vi.advanceTimersByTime(5200);
    });
    expect(mockDismissPrompt).toHaveBeenCalledWith("test-11");
  });
});
