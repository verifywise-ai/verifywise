import { screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SetupModal from "../SetupModal";
import { updateOnboardingStatus } from "../../../../application/repository/organization.repository";
import { postAutoDrivers } from "../../../../application/repository/entity.repository";

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ organizationId: 1 }),
}));

vi.mock("../../../../application/repository/entity.repository", () => ({
  postAutoDrivers: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../../../application/repository/organization.repository", () => ({
  updateOnboardingStatus: vi.fn().mockResolvedValue({}),
}));

describe("SetupModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateOnboardingStatus).mockReset().mockResolvedValue({});
    vi.mocked(postAutoDrivers).mockReset().mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders the welcome header", () => {
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Welcome to VerifyWise")).toBeInTheDocument();
  });

  it("renders both setup options", () => {
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Add demo data")).toBeInTheDocument();
    expect(screen.getByText("Start blank")).toBeInTheDocument();
  });

  it("renders the skip button", () => {
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Skip for now")).toBeInTheDocument();
  });

  it("calls onSkip when Skip for now is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSkip = vi.fn();
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={onSkip} />);
    await user.click(screen.getByText("Skip for now"));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("waits for Explore the demo before completing and reloading", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadSpy },
      writable: true,
    });
    const onComplete = vi.fn();
    renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Add demo data"));

    await user.click(await screen.findByText("Explore the demo"));
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("saves completed to Redux as soon as the demo data is in", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onComplete = vi.fn();
    const { store } = renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />, {
      preloadedAuth: { onboardingStatus: "pending" },
    });
    await user.click(screen.getByText("Add demo data"));
    await screen.findByText("Explore the demo");

    // A refresh now must not bring the modal back, so the persisted status is
    // already completed before the user clicks Explore.
    expect(store.getState().auth.onboardingStatus).toBe("completed");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("completes and reloads only once on a double-click of Explore the demo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadSpy }, writable: true });
    const onComplete = vi.fn();
    renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Add demo data"));
    await user.dblClick(await screen.findByText("Explore the demo"));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("calls onComplete when Start blank is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onComplete = vi.fn();
    renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Start blank"));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows the demo data loader while demo data is created", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(postAutoDrivers).mockReturnValueOnce(new Promise(() => {}));
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Add demo data"));
    expect(screen.getByTestId("demo-data-loader")).toBeInTheDocument();
    expect(screen.getByText("Setting up your demo workspace")).toBeInTheDocument();
    expect(screen.queryByText("Start blank")).not.toBeInTheDocument();
  });

  it("shows spinner when Start blank is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Start blank"));
    expect(document.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();
  });

  it("renders description text", () => {
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText(/How would you like to get started/)).toBeInTheDocument();
  });

  it("renders option descriptions", () => {
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Explore with sample projects and controls")).toBeInTheDocument();
    expect(screen.getByText("Begin with a clean dashboard")).toBeInTheDocument();
  });

  const ERROR_TEXT =
    "Something went wrong while setting up your workspace. Try again, or skip for now.";

  it("shows an error and stays open when saving the choice fails", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(updateOnboardingStatus).mockRejectedValueOnce(new Error("network"));
    const onComplete = vi.fn();
    renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByText("Start blank"));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR_TEXT);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("clears the error when the retry succeeds", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(updateOnboardingStatus).mockRejectedValueOnce(new Error("network"));
    const onComplete = vi.fn();
    renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByText("Start blank"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByText("Start blank"));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows an error and does not reload when the demo data call fails", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadSpy }, writable: true });
    vi.mocked(postAutoDrivers).mockRejectedValueOnce(new Error("network"));
    const onComplete = vi.fn();
    renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByText("Add demo data"));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR_TEXT);
    expect(updateOnboardingStatus).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("does not send the demo data again when only the status save failed", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    Object.defineProperty(window, "location", { value: { reload: vi.fn() }, writable: true });
    vi.mocked(updateOnboardingStatus).mockRejectedValueOnce(new Error("network"));
    const onComplete = vi.fn();
    renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByText("Add demo data"));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByText("Add demo data"));
    await user.click(await screen.findByText("Explore the demo"));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(postAutoDrivers).toHaveBeenCalledTimes(1);
    expect(updateOnboardingStatus).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("still closes on Skip for now when the status save fails", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(updateOnboardingStatus).mockRejectedValueOnce(new Error("network"));
    const onSkip = vi.fn();
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={onSkip} />);

    await user.click(screen.getByText("Skip for now"));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
