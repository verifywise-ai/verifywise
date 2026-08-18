import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FindingRow } from "../FindingRow";
import type { Finding } from "../../../../../domain/ai-detection/types";

const mockUpdateFindingGovernanceStatus = vi.fn();

vi.mock("../../../../../application/repository/aiDetection.repository", () => ({
  updateFindingGovernanceStatus: (...args: unknown[]) => mockUpdateFindingGovernanceStatus(...args),
  createSuppression: vi.fn(),
}));

const baseFinding: Finding = {
  id: 1,
  finding_type: "library",
  category: "AI/ML",
  name: "openai",
  provider: "OpenAI",
  confidence: "high",
  risk_level: "high",
  description: "Direct import of the OpenAI SDK",
  file_count: 2,
  file_paths: [
    { path: "src/app.py", line_number: 10, matched_text: "import openai" },
    { path: "src/utils.py", line_number: null, matched_text: "" },
  ],
};

describe("FindingRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the finding name and description", () => {
    render(
      <FindingRow
        finding={baseFinding}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={1}
      />,
    );

    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("Direct import of the OpenAI SDK")).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });

  it("shows singular 'file' label when file_count is 1", () => {
    render(
      <FindingRow
        finding={{ ...baseFinding, file_count: 1 }}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={1}
      />,
    );

    expect(screen.getByText("1 file")).toBeInTheDocument();
  });

  it("expands to show file paths when the row header is clicked", () => {
    render(
      <FindingRow
        finding={baseFinding}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={1}
      />,
    );

    expect(screen.queryByText("Found in:")).not.toBeVisible();

    fireEvent.click(screen.getByText("openai"));

    expect(screen.getByText("Found in:")).toBeVisible();
    expect(screen.getByText("src/app.py")).toBeInTheDocument();
    expect(screen.getByText("src/utils.py")).toBeInTheDocument();
  });

  it("shows a suppressed badge when the finding is suppressed", () => {
    render(
      <FindingRow
        finding={{ ...baseFinding, suppressed: true }}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={1}
      />,
    );

    expect(screen.getByText("Suppressed")).toBeInTheDocument();
  });

  it("shows a license badge when license info is present", () => {
    render(
      <FindingRow
        finding={{
          ...baseFinding,
          license_id: "MIT",
          license_name: "MIT License",
          license_risk: "low",
        }}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={1}
      />,
    );

    expect(screen.getByText("MIT")).toBeInTheDocument();
  });

  it("shows a finding status chip for carried-forward findings", () => {
    render(
      <FindingRow
        finding={{ ...baseFinding, finding_status: "carried_forward" }}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={1}
      />,
    );

    expect(screen.getByText("Carried forward")).toBeInTheDocument();
  });

  it("shows a finding status chip for fixed findings", () => {
    render(
      <FindingRow
        finding={{ ...baseFinding, finding_status: "fixed" }}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={1}
      />,
    );

    expect(screen.getByText("Fixed")).toBeInTheDocument();
  });

  it("does not render a finding status chip for active findings", () => {
    render(
      <FindingRow
        finding={{ ...baseFinding, finding_status: "active" }}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={1}
      />,
    );

    expect(screen.queryByText("Fixed")).not.toBeInTheDocument();
    expect(screen.queryByText("Carried forward")).not.toBeInTheDocument();
  });

  it("opens the governance popover and updates status on selection", async () => {
    mockUpdateFindingGovernanceStatus.mockResolvedValue({});
    const onGovernanceChange = vi.fn();
    const onStatusMessage = vi.fn();

    render(
      <FindingRow
        finding={baseFinding}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={7}
        onGovernanceChange={onGovernanceChange}
        onStatusMessage={onStatusMessage}
      />,
    );

    // Governance icon button is the last icon button in the header
    const iconButtons = screen.getAllByRole("button");
    fireEvent.click(iconButtons[iconButtons.length - 1]);

    const approvedOption = await screen.findByText("Approved");
    fireEvent.click(approvedOption);

    await waitFor(() => {
      expect(mockUpdateFindingGovernanceStatus).toHaveBeenCalledWith(7, 1, "approved");
    });
    await waitFor(() => {
      expect(onGovernanceChange).toHaveBeenCalledWith(1, "approved");
    });
    expect(onStatusMessage).toHaveBeenCalledWith("success", "Status updated to Approved");
  });

  it("reverts the status and reports an error message when the update fails", async () => {
    mockUpdateFindingGovernanceStatus.mockRejectedValue(new Error("network error"));
    const onStatusMessage = vi.fn();

    render(
      <FindingRow
        finding={baseFinding}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={7}
        onStatusMessage={onStatusMessage}
      />,
    );

    const iconButtons = screen.getAllByRole("button");
    fireEvent.click(iconButtons[iconButtons.length - 1]);

    const approvedOption = await screen.findByText("Approved");
    fireEvent.click(approvedOption);

    await waitFor(() => {
      expect(onStatusMessage).toHaveBeenCalledWith("error", "Failed to update governance status");
    });
  });

  it("does not call the API when re-selecting the current status", async () => {
    render(
      <FindingRow
        finding={{ ...baseFinding, governance_status: "approved" }}
        repositoryOwner="acme"
        repositoryName="widgets"
        scanId={7}
      />,
    );

    const iconButtons = screen.getAllByRole("button");
    fireEvent.click(iconButtons[iconButtons.length - 1]);

    const approvedOption = await screen.findByText("Approved");
    fireEvent.click(approvedOption);

    expect(mockUpdateFindingGovernanceStatus).not.toHaveBeenCalled();
  });

  it("does not link file paths when repositoryOwner/repositoryName are missing", () => {
    render(<FindingRow finding={baseFinding} repositoryOwner="" repositoryName="" scanId={1} />);

    fireEvent.click(screen.getByText("openai"));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
