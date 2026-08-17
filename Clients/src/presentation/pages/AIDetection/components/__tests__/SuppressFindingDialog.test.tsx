import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "../../../../../test/renderWithProviders";
import SuppressFindingDialog from "../SuppressFindingDialog";
import type { Finding } from "../../../../../domain/ai-detection/types";

const mockCreateSuppression = vi.fn();

vi.mock("../../../../../application/repository/aiDetection.repository", () => ({
  createSuppression: (...args: unknown[]) => mockCreateSuppression(...args),
}));

const finding: Finding = {
  id: 1,
  finding_type: "api_call",
  category: "AI/ML",
  name: "openai-completion",
  provider: "OpenAI",
  confidence: "high",
  risk_level: "high",
  file_count: 1,
  file_paths: [],
};

describe("SuppressFindingDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when finding is null", () => {
    const { container } = render(
      <SuppressFindingDialog isOpen finding={null} onClose={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not render dialog content when closed", () => {
    render(<SuppressFindingDialog isOpen={false} finding={finding} onClose={vi.fn()} />);
    expect(screen.queryByText("Suppress finding")).not.toBeInTheDocument();
  });

  it("renders the finding name and scope options when open", () => {
    render(<SuppressFindingDialog isOpen finding={finding} onClose={vi.fn()} />);

    expect(screen.getByText("Suppress finding")).toBeInTheDocument();
    expect(screen.getByText(/openai-completion \(OpenAI\)/)).toBeInTheDocument();
    expect(screen.getByText("All findings with this name")).toBeInTheDocument();
    expect(screen.getByText("All findings of this type")).toBeInTheDocument();
  });

  it("shows a validation error when submitting without a reason", async () => {
    render(<SuppressFindingDialog isOpen finding={finding} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("Suppress"));

    await waitFor(() => {
      expect(screen.getByText("Reason is required")).toBeInTheDocument();
    });
    expect(mockCreateSuppression).not.toHaveBeenCalled();
  });

  it("submits a by-name suppression rule with the entered reason", async () => {
    mockCreateSuppression.mockResolvedValue({ id: 1 });
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <SuppressFindingDialog
        isOpen
        finding={finding}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "Known internal mock, safe to ignore" },
    });

    fireEvent.click(screen.getByText("Suppress"));

    await waitFor(() => {
      expect(mockCreateSuppression).toHaveBeenCalledWith({
        match_type: "exact",
        field: "name",
        value: "openai-completion",
        reason: "Known internal mock, safe to ignore",
        expires_at: null,
      });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('Suppression rule created for "openai-completion"');
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("submits a by-type suppression rule when that scope is selected", async () => {
    mockCreateSuppression.mockResolvedValue({ id: 1 });

    render(<SuppressFindingDialog isOpen finding={finding} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText("All findings of this type"));
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "Suppress the whole category" },
    });
    fireEvent.click(screen.getByText("Suppress"));

    await waitFor(() => {
      expect(mockCreateSuppression).toHaveBeenCalledWith(
        expect.objectContaining({ field: "finding_type", value: "api_call" }),
      );
    });
  });

  it("calls onError with a message when the API call fails", async () => {
    mockCreateSuppression.mockRejectedValue(new Error("Server exploded"));
    const onError = vi.fn();

    render(<SuppressFindingDialog isOpen finding={finding} onClose={vi.fn()} onError={onError} />);

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "Reason text" },
    });
    fireEvent.click(screen.getByText("Suppress"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Server exploded");
    });
  });

  it("calls onClose when cancel is clicked", () => {
    const onClose = vi.fn();
    render(<SuppressFindingDialog isOpen finding={finding} onClose={onClose} />);

    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
