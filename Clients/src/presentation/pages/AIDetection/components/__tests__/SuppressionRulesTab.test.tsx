import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "../../../../../test/renderWithProviders";
import SuppressionRulesTab from "../SuppressionRulesTab";
import type { SuppressionRule } from "../../../../../domain/ai-detection/types";

const mockListSuppressions = vi.fn();
const mockDeleteSuppression = vi.fn();

vi.mock("../../../../../application/repository/aiDetection.repository", () => ({
  listSuppressions: (...args: unknown[]) => mockListSuppressions(...args),
  deleteSuppression: (...args: unknown[]) => mockDeleteSuppression(...args),
}));

function makeRule(overrides: Partial<SuppressionRule> = {}): SuppressionRule {
  return {
    id: 1,
    organization_id: 1,
    match_type: "exact",
    field: "name",
    value: "openai",
    reason: "Known false positive",
    expires_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("SuppressionRulesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading spinner while fetching rules", () => {
    mockListSuppressions.mockImplementation(() => new Promise(() => {}));
    render(<SuppressionRulesTab />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an empty state when there are no rules", async () => {
    mockListSuppressions.mockResolvedValue([]);
    render(<SuppressionRulesTab />);

    await waitFor(() => {
      expect(screen.getByText("No suppression rules yet")).toBeInTheDocument();
    });
  });

  it("renders a table row for each rule", async () => {
    mockListSuppressions.mockResolvedValue([
      makeRule({ id: 1, value: "openai" }),
      makeRule({ id: 2, value: "secret_key", field: "finding_type", match_type: "pattern" }),
    ]);
    render(<SuppressionRulesTab />);

    await waitFor(() => {
      expect(screen.getByText("openai")).toBeInTheDocument();
    });
    expect(screen.getByText("secret_key")).toBeInTheDocument();
    expect(screen.getByText("Pattern")).toBeInTheDocument();
    expect(screen.getByText("Finding type")).toBeInTheDocument();
  });

  it("shows 'Never' for rules without an expiry date", async () => {
    mockListSuppressions.mockResolvedValue([makeRule({ expires_at: null })]);
    render(<SuppressionRulesTab />);

    await waitFor(() => {
      expect(screen.getByText("Never")).toBeInTheDocument();
    });
  });

  it("marks past expiry dates as expired", async () => {
    mockListSuppressions.mockResolvedValue([makeRule({ expires_at: "2020-01-01T00:00:00Z" })]);
    render(<SuppressionRulesTab />);

    await waitFor(() => {
      expect(screen.getByText(/\(expired\)/)).toBeInTheDocument();
    });
  });

  it("shows a dash when reason is missing", async () => {
    mockListSuppressions.mockResolvedValue([makeRule({ reason: null })]);
    render(<SuppressionRulesTab />);

    await waitFor(() => {
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });

  it("reports an error message when loading rules fails", async () => {
    mockListSuppressions.mockRejectedValue(new Error("Network down"));
    const onMessage = vi.fn();
    render(<SuppressionRulesTab onMessage={onMessage} />);

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith("error", "Network down");
    });
  });

  it("opens a confirm dialog and deletes the rule on confirm", async () => {
    mockListSuppressions.mockResolvedValue([makeRule({ id: 5, value: "openai" })]);
    mockDeleteSuppression.mockResolvedValue(undefined);
    const onMessage = vi.fn();

    render(<SuppressionRulesTab onMessage={onMessage} />);

    await waitFor(() => {
      expect(screen.getByText("openai")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Delete suppression rule"));

    expect(await screen.findByText("Delete suppression rule?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(mockDeleteSuppression).toHaveBeenCalledWith(5);
    });
    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith("success", "Suppression rule deleted");
    });
  });

  it("reports an error message when delete fails", async () => {
    mockListSuppressions.mockResolvedValue([makeRule({ id: 5, value: "openai" })]);
    mockDeleteSuppression.mockRejectedValue(new Error("Delete failed"));
    const onMessage = vi.fn();

    render(<SuppressionRulesTab onMessage={onMessage} />);

    await waitFor(() => {
      expect(screen.getByText("openai")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Delete suppression rule"));
    fireEvent.click(await screen.findByText("Delete"));

    await waitFor(() => {
      expect(onMessage).toHaveBeenCalledWith("error", "Delete failed");
    });
  });
});
