import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import LifecycleCheckSection from "../LifecycleCheckSection";

const mockGetSettings = vi.fn();
const mockUpdateSettings = vi.fn();

vi.mock("../../../../../application/repository/useCaseLifecycle.repository", () => ({
  getLifecycleSettings: (...args: unknown[]) => mockGetSettings(...args),
  updateLifecycleSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

describe("LifecycleCheckSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue({ organization_id: 1, confirmation_interval_days: 90 });
    mockUpdateSettings.mockImplementation((days: number) =>
      Promise.resolve({ organization_id: 1, confirmation_interval_days: days }),
    );
  });

  it("loads the current interval and saves a new one", async () => {
    const onSuccess = vi.fn();
    renderWithProviders(<LifecycleCheckSection onError={vi.fn()} onSuccess={onSuccess} />);

    const select = await screen.findByRole("combobox");
    await waitFor(() => expect(select.textContent).toContain("Every 90 days"));

    fireEvent.mouseDown(select);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("Every 30 days"));

    fireEvent.click(screen.getByTestId("lifecycle-save-interval-btn"));
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith(30));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("Live use case check saved"));
  });

  it("is disabled for non-admins", async () => {
    renderWithProviders(<LifecycleCheckSection isDisabled onError={vi.fn()} onSuccess={vi.fn()} />);
    const button = screen.getByTestId("lifecycle-save-interval-btn");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it("reports a failed save", async () => {
    mockUpdateSettings.mockRejectedValue(
      new Error("The check interval must be 30, 90 or 180 days"),
    );
    const onError = vi.fn();
    renderWithProviders(<LifecycleCheckSection onError={onError} onSuccess={vi.fn()} />);
    await screen.findByRole("combobox");
    fireEvent.click(screen.getByTestId("lifecycle-save-interval-btn"));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("The check interval must be 30, 90 or 180 days"),
    );
  });
});
