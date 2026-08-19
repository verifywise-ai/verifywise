import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import MetricsFeedSection from "./MetricsFeedSection";
import { IMrmIngestionToken } from "../../../../domain/interfaces/i.mrm";

const mockUseIngestionTokens = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockRotateMutateAsync = vi.fn();
const mockRevokeMutateAsync = vi.fn();
const mockUseCreateIngestionToken = vi.fn();
const mockUseRotateIngestionToken = vi.fn();
const mockUseRevokeIngestionToken = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useIngestionTokens: () => mockUseIngestionTokens(),
  useCreateIngestionToken: () => mockUseCreateIngestionToken(),
  useRotateIngestionToken: () => mockUseRotateIngestionToken(),
  useRevokeIngestionToken: () => mockUseRevokeIngestionToken(),
}));

Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

const token: IMrmIngestionToken = {
  id: 1,
  name: "Airflow (prod)",
  model_inventory_id: null,
  last_used_at: null,
  revoked_at: null,
  created_by: 1,
  created_at: "2026-08-01T00:00:00Z",
};

describe("MetricsFeedSection", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateIngestionToken.mockReturnValue({
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
    });
    mockUseRotateIngestionToken.mockReturnValue({
      mutateAsync: mockRotateMutateAsync,
      isPending: false,
    });
    mockUseRevokeIngestionToken.mockReturnValue({
      mutateAsync: mockRevokeMutateAsync,
      isPending: false,
    });
  });

  it("shows an empty state when there are no tokens", () => {
    mockUseIngestionTokens.mockReturnValue({ data: [] });
    renderWithProviders(<MetricsFeedSection onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/No ingestion tokens yet/)).toBeInTheDocument();
  });

  it("renders the endpoint, example request and payload schema", () => {
    mockUseIngestionTokens.mockReturnValue({ data: [] });
    renderWithProviders(<MetricsFeedSection onError={onError} onSuccess={onSuccess} />);
    expect(
      screen.getByText("POST https://your-server/api/mrm/models/{externalModelKey}/metrics"),
    ).toBeInTheDocument();
    expect(screen.getByText("Payload schema")).toBeInTheDocument();
  });

  it("renders an active token row with rotate/revoke actions", () => {
    mockUseIngestionTokens.mockReturnValue({ data: [token] });
    renderWithProviders(<MetricsFeedSection onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText("Airflow (prod)")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Rotate")).toBeInTheDocument();
    expect(screen.getByText("Revoke")).toBeInTheDocument();
  });

  it("renders a revoked token without action buttons", () => {
    mockUseIngestionTokens.mockReturnValue({
      data: [{ ...token, revoked_at: "2026-08-10T00:00:00Z" }],
    });
    renderWithProviders(<MetricsFeedSection onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.queryByText("Rotate")).not.toBeInTheDocument();
  });

  it("validates the token name before creating", async () => {
    mockUseIngestionTokens.mockReturnValue({ data: [] });
    renderWithProviders(<MetricsFeedSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-create-token-btn"));
    await waitFor(() =>
      expect(screen.getAllByText("Create ingestion token").length).toBeGreaterThan(1),
    );

    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Give the token a name so you can recognise it later.");
    });
  });

  it("creates a token and shows the plaintext once", async () => {
    mockUseIngestionTokens.mockReturnValue({ data: [] });
    mockCreateMutateAsync.mockResolvedValue({ ...token, token: "mrm_plaintext_abc" });
    renderWithProviders(<MetricsFeedSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-create-token-btn"));
    const nameInput = await screen.findByPlaceholderText("e.g. Airflow (prod)");
    fireEvent.change(nameInput, { target: { value: "Airflow (prod)" } });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({ name: "Airflow (prod)" });
      expect(screen.getByText("mrm_plaintext_abc")).toBeInTheDocument();
      expect(onSuccess).toHaveBeenCalledWith("Ingestion token created");
    });
  });

  it("rotates a token", async () => {
    mockUseIngestionTokens.mockReturnValue({ data: [token] });
    mockRotateMutateAsync.mockResolvedValue({ ...token, token: "mrm_rotated" });
    renderWithProviders(<MetricsFeedSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("Rotate"));

    await waitFor(() => {
      expect(mockRotateMutateAsync).toHaveBeenCalledWith(1);
      expect(onSuccess).toHaveBeenCalledWith("Token rotated");
    });
  });

  it("revokes a token", async () => {
    mockUseIngestionTokens.mockReturnValue({ data: [token] });
    mockRevokeMutateAsync.mockResolvedValue({});
    renderWithProviders(<MetricsFeedSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("Revoke"));

    await waitFor(() => {
      expect(mockRevokeMutateAsync).toHaveBeenCalledWith(1);
      expect(onSuccess).toHaveBeenCalledWith("Token revoked");
    });
  });

  it("copies the example request to the clipboard", async () => {
    mockUseIngestionTokens.mockReturnValue({ data: [] });
    renderWithProviders(<MetricsFeedSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-copy-curl-btn"));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith("Copied to clipboard");
    });
  });
});
