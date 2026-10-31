import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AIAppLifecyclePanel from "../AIAppLifecyclePanel";

const mockConfirm = vi.fn();
let mockState: Record<string, unknown> = {};
vi.mock("../../../../../application/repository/aiAppLifecycle.repository", () => ({
  getAiAppLifecycle: () => Promise.resolve(mockState),
  getAiAppLifecycleSummary: vi.fn(),
  markAiAppLive: vi.fn(),
  retireAiApp: vi.fn(),
  confirmAiAppStillLive: (...args: unknown[]) => mockConfirm(...args),
}));

let mockPermissions: string[] = [];
vi.mock("../../../../../application/hooks/useMyPermissions", () => ({
  useMyPermissions: () => ({ permissions: mockPermissions, isLoading: false, error: null }),
}));

let mockRole = "Reviewer";
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockRole, userId: 5 }),
}));

const state = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  owner: 5,
  lifecycle_stage: "live",
  go_live_date: "2026-01-10",
  retired_at: null,
  last_confirmed_at: null,
  last_confirmed_by: null,
  is_stale: true,
  confirmation_interval_days: 90,
  ...overrides,
});

describe("AIAppLifecyclePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = [];
    mockRole = "Reviewer";
  });

  it("lets the owner confirm a stale live AI app", async () => {
    mockState = state();
    mockConfirm.mockResolvedValue(undefined);
    renderWithProviders(<AIAppLifecyclePanel appId={3} />);

    expect(await screen.findByText(/Nobody has confirmed this AI app/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lifecycle-confirm-btn"));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(3));
  });

  it("hides the actions from a non-owner without aiApp.edit", async () => {
    mockState = state({ owner: 99, is_stale: false });
    renderWithProviders(<AIAppLifecyclePanel appId={3} />);
    expect(await screen.findByTestId("ai-app-lifecycle-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-confirm-btn")).toBeNull();
  });

  it("is read-only for an Auditor who owns the app", async () => {
    mockRole = "Auditor";
    mockPermissions = ["aiApp.edit"];
    mockState = state({ lifecycle_stage: "planned" });
    renderWithProviders(<AIAppLifecyclePanel appId={3} />);
    expect(await screen.findByTestId("ai-app-lifecycle-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("lifecycle-go-live-btn")).toBeNull();
  });
});
