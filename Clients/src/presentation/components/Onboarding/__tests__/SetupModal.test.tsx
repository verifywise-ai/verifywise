import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SetupModal from "../SetupModal";

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
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
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
    vi.advanceTimersByTime(400);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("calls onComplete and reloads when Add demo data is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadSpy },
      writable: true,
    });
    const onComplete = vi.fn();
    renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Add demo data"));
    vi.advanceTimersByTime(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it("calls onComplete when Start blank is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onComplete = vi.fn();
    renderWithProviders(<SetupModal onComplete={onComplete} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Start blank"));
    vi.advanceTimersByTime(400);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows spinner when Add demo data is clicked", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithProviders(<SetupModal onComplete={vi.fn()} onSkip={vi.fn()} />);
    await user.click(screen.getByText("Add demo data"));
    expect(document.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();
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
});
