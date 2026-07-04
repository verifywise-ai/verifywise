import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ScorersTableBody from "../ScorersTableBody";
import type { ScorerRow } from "../index";

const mockRows: ScorerRow[] = [
  {
    id: "1",
    name: "Exact Match Scorer",
    type: "builtin",
    metricKey: "exact_match",
    enabled: true,
    defaultThreshold: 0.8,
    config: {
      judgeModel: "gpt-4",
      choiceScores: [
        { label: "Correct", score: 1 },
        { label: "Incorrect", score: 0 },
      ],
    },
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-06-01T12:00:00Z",
  },
  {
    id: "2",
    name: "Custom Relevance",
    type: "custom",
    metricKey: "relevance",
    enabled: true,
    config: {
      judgeModel: { name: "claude-3-opus", provider: "anthropic" },
    },
    createdAt: "2025-03-20T08:30:00Z",
  },
  {
    id: "3",
    name: "No Config Scorer",
    type: "builtin",
    metricKey: "fallback",
    enabled: false,
    createdAt: "2025-05-10T14:00:00Z",
  },
];

const defaultProps = {
  rows: mockRows,
  page: 0,
  rowsPerPage: 10,
};

describe("ScorersTableBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all rows", () => {
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Exact Match Scorer")).toBeInTheDocument();
    expect(screen.getByText("Custom Relevance")).toBeInTheDocument();
    expect(screen.getByText("No Config Scorer")).toBeInTheDocument();
  });

  it("renders model name from string judgeModel", () => {
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
  });

  it("renders model name from object judgeModel", () => {
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("claude-3-opus")).toBeInTheDocument();
  });

  it("renders fallback model name when config is missing", () => {
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("fallback")).toBeInTheDocument();
  });

  it("renders threshold value", () => {
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("0.8")).toBeInTheDocument();
  });

  it("renders dash for missing threshold", () => {
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} />
      </table>,
    );
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders choice scores count", () => {
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders dash for rows with no choice scores", () => {
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} />
      </table>,
    );
    const dashElements = screen.getAllByText("-");
    expect(dashElements.length).toBeGreaterThanOrEqual(1);
  });

  it("calls onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} onRowClick={onRowClick} />
      </table>,
    );
    await user.click(screen.getByText("Exact Match Scorer"));
    expect(onRowClick).toHaveBeenCalledWith(mockRows[0]);
  });

  it("opens action menu on more button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} onEdit={vi.fn()} onDelete={vi.fn()} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onEdit from action menu", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} onEdit={onEdit} onDelete={vi.fn()} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(mockRows[0]);
  });

  it("calls onDelete from action menu", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(mockRows[0]);
  });

  it("closes menu after edit action", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} onEdit={onEdit} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Edit"));
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("respects rowsPerPage pagination", () => {
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} page={0} rowsPerPage={2} />
      </table>,
    );
    expect(screen.getByText("Exact Match Scorer")).toBeInTheDocument();
    expect(screen.getByText("Custom Relevance")).toBeInTheDocument();
    expect(screen.queryByText("No Config Scorer")).not.toBeInTheDocument();
  });

  it("renders with empty rows", () => {
    const { container } = renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} rows={[]} />
      </table>,
    );
    const tbody = container.querySelector("tbody");
    expect(tbody?.children).toHaveLength(0);
  });

  it("does not crash when onEdit and onDelete are not provided", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ScorersTableBody {...defaultProps} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });
});
