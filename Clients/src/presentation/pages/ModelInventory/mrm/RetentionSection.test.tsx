import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RetentionSection from "./RetentionSection";
import { IMrmOrgSettings } from "../../../../domain/interfaces/i.mrm";

const mockUseMrmSettings = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseUpdateMrmSettings = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useMrmSettings: () => mockUseMrmSettings(),
  useUpdateMrmSettings: () => mockUseUpdateMrmSettings(),
}));

const settings: IMrmOrgSettings = {
  organization_id: 1,
  retention_months: 24,
  alert_email_enabled: true,
  breach_auto_open_finding: false,
  alert_recipients: [],
};

describe("RetentionSection", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpdateMrmSettings.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
  });

  it("seeds the months field from loaded settings", () => {
    mockUseMrmSettings.mockReturnValue({ data: settings });
    renderWithProviders(<RetentionSection onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByDisplayValue("24")).toBeInTheDocument();
  });

  it("rejects a retention below the 13-month minimum", async () => {
    mockUseMrmSettings.mockReturnValue({ data: settings });
    renderWithProviders(<RetentionSection onError={onError} onSuccess={onSuccess} />);

    const input = screen.getByDisplayValue("24");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.click(screen.getByText("Save retention"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Retention must be at least 13 months");
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("saves a valid retention value", async () => {
    mockUseMrmSettings.mockReturnValue({ data: settings });
    mockMutateAsync.mockResolvedValue({});
    renderWithProviders(<RetentionSection onError={onError} onSuccess={onSuccess} />);

    const input = screen.getByDisplayValue("24");
    fireEvent.change(input, { target: { value: "18" } });
    fireEvent.click(screen.getByText("Save retention"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ retention_months: 18 });
      expect(onSuccess).toHaveBeenCalledWith("Retention saved");
    });
  });

  it("surfaces an error when saving fails", async () => {
    mockUseMrmSettings.mockReturnValue({ data: settings });
    mockMutateAsync.mockRejectedValue(new Error("boom"));
    renderWithProviders(<RetentionSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("Save retention"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Failed to save retention");
    });
  });
});
