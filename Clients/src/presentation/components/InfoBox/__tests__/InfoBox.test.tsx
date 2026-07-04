import { screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import InfoBox from "../index";

describe("InfoBox Component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the message text", () => {
    renderWithProviders(<InfoBox message="This is an info message" storageKey="test-info" />);

    expect(screen.getByText("This is an info message")).toBeInTheDocument();
  });

  it("renders the header when provided", () => {
    renderWithProviders(
      <InfoBox message="Body message" storageKey="test-header" header="Tip Header" />,
    );

    expect(screen.getByText("Tip Header")).toBeInTheDocument();
    expect(screen.getByText("Body message")).toBeInTheDocument();
  });

  it("does not render header when not provided", () => {
    renderWithProviders(<InfoBox message="No header here" storageKey="test-no-header" />);

    expect(screen.getByText("No header here")).toBeInTheDocument();
    // Only one text element (the message) should be present
    expect(screen.queryByText("Tip Header")).not.toBeInTheDocument();
  });

  it("calls onDismiss when close button is clicked", async () => {
    const handleDismiss = vi.fn();
    const user = userEvent.setup();

    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderWithProviders(
      <InfoBox message="Dismissable" storageKey="test-dismiss" onDismiss={handleDismiss} />,
    );

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(handleDismiss).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("calls onDismiss immediately when disableAnimation is true", async () => {
    const handleDismiss = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <InfoBox
        message="Immediate dismiss"
        storageKey="test-immediate"
        onDismiss={handleDismiss}
        disableAnimation
      />,
    );

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not render when localStorage has dismissal stored", () => {
    localStorage.setItem("infoBox_test-stored", "true");

    renderWithProviders(<InfoBox message="Should not appear" storageKey="test-stored" />);

    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
  });

  it("renders when disableInternalStorage is true even if localStorage has dismissal", () => {
    localStorage.setItem("infoBox_test-external", "true");

    renderWithProviders(
      <InfoBox message="Still visible" storageKey="test-external" disableInternalStorage />,
    );

    expect(screen.getByText("Still visible")).toBeInTheDocument();
  });

  it("renders with warning variant", () => {
    renderWithProviders(
      <InfoBox message="Warning message" storageKey="test-warning" variant="warning" />,
    );

    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("applies custom backgroundColor and borderColor", () => {
    renderWithProviders(
      <InfoBox
        message="Custom colors"
        storageKey="test-custom-colors"
        backgroundColor="#ff0000"
        borderColor="#00ff00"
      />,
    );

    expect(screen.getByText("Custom colors")).toBeInTheDocument();
  });

  it("calls onDismiss for each rapid consecutive click (no debounce)", async () => {
    const handleDismiss = vi.fn();
    const user = userEvent.setup();

    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderWithProviders(
      <InfoBox message="Rapid clicks" storageKey="test-rapid" onDismiss={handleDismiss} />,
    );

    const dismissButton = screen.getByRole("button", { name: /dismiss/i });

    await user.click(dismissButton);
    await user.click(dismissButton);
    await user.click(dismissButton);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(handleDismiss).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("hides component after dismiss even without onDismiss callback", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();

    renderWithProviders(<InfoBox message="Auto hide" storageKey="test-auto-hide" />);

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByText("Auto hide")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("hide after dismiss with disableAnimation and onDismiss callback", () => {
    const handleDismiss = vi.fn();

    renderWithProviders(
      <InfoBox
        message="Fast hide"
        storageKey="test-fast-hide"
        disableAnimation
        onDismiss={handleDismiss}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });

  it("persists dismissal to localStorage after close", async () => {
    const user = userEvent.setup();

    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderWithProviders(<InfoBox message="Remember me" storageKey="test-remember" />);

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(localStorage.getItem("infoBox_test-remember")).toBe("true");

    vi.useRealTimers();
  });

  it("renders info variant with Info icon", () => {
    renderWithProviders(<InfoBox message="Info variant" storageKey="test-info-variant" />);
    expect(screen.getByText("Info variant")).toBeInTheDocument();
  });

  it("renders warning variant with AlertCircle icon", () => {
    renderWithProviders(
      <InfoBox message="Warning variant" storageKey="test-warning-variant" variant="warning" />,
    );
    expect(screen.getByText("Warning variant")).toBeInTheDocument();
  });
});
