import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ExperimentTableBody from "../ExperimentTableBody";
import type { IExperimentRow } from "../../../../types/interfaces/i.table";

const mockRows: IExperimentRow[] = [
  {
    id: "1",
    name: "GPT-4 Baseline",
    model: "gpt-4",
    judge: "exact_match",
    dataset: "customer-support.jsonl",
    prompts: 150,
    linkedModel: 42,
    date: "Jun 1, 2025, 02:00 PM",
    status: "Completed",
  },
  {
    id: "2",
    name: "Claude Comparison",
    model: "claude-3-opus",
    judge: "relevance",
    dataset: "rag-eval.jsonl",
    prompts: 75,
    linkedModel: null,
    date: "Jun 2, 2025, 10:30 AM",
    status: "Running",
  },
  {
    id: "3",
    name: "Failed Run",
    model: "llama-3-70b",
    judge: "custom-scorer",
    dataset: "test-set.jsonl",
    prompts: 10,
    date: "Jun 3, 2025, 08:00 AM",
    status: "Failed",
  },
  {
    id: "4",
    name: "Pending Experiment",
    model: "mistral-large",
    judge: "accuracy",
    dataset: "validation.jsonl",
    prompts: 200,
    status: "Pending",
  },
];

const defaultProps = {
  rows: mockRows,
  page: 0,
  rowsPerPage: 10,
  onRowClick: vi.fn(),
};

describe("ExperimentTableBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders experiment names for completed rows", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("GPT-4 Baseline")).toBeInTheDocument();
  });

  it("renders Running status with animation", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getAllByText("Running...").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Failed status", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders model names", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
    expect(screen.getByText("claude-3-opus")).toBeInTheDocument();
  });

  it("renders judge/scorer column", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("exact_match")).toBeInTheDocument();
    expect(screen.getByText("relevance")).toBeInTheDocument();
  });

  it("renders dash when judge is missing", () => {
    const rowsNoJudge = [
      {
        id: "99",
        name: "No Judge",
        model: "gpt-4",
        dataset: "test.jsonl",
        prompts: 10,
        status: "Completed" as const,
      },
    ];
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} rows={rowsNoJudge} />
      </table>,
    );
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(1);
  });

  it("renders prompt count", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("renders dataset names", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("customer-support.jsonl")).toBeInTheDocument();
  });

  it("shows Linked badge when linkedModel is present", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Linked")).toBeInTheDocument();
  });

  it("shows Unlinked when linkedModel is null", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getAllByText("Unlinked").length).toBeGreaterThanOrEqual(1);
  });

  it("renders date column", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Jun 1, 2025, 02:00 PM")).toBeInTheDocument();
  });

  it("calls onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} onRowClick={onRowClick} />
      </table>,
    );
    await user.click(screen.getByText("GPT-4 Baseline"));
    expect(onRowClick).toHaveBeenCalledWith(mockRows[0]);
  });

  it("opens action menu on more button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} onRerun={vi.fn()} onDelete={vi.fn()} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.getByText("Rerun")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows download and copy only for completed experiments", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ExperimentTableBody
          {...defaultProps}
          onRerun={vi.fn()}
          onDownload={vi.fn()}
          onCopy={vi.fn()}
          onDelete={vi.fn()}
        />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.getByText("Download results as JSON")).toBeInTheDocument();
    expect(screen.getByText("Copy results to clipboard")).toBeInTheDocument();
    expect(screen.getByText("Rerun")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onRerun from action menu", async () => {
    const onRerun = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} onRerun={onRerun} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Rerun"));
    expect(onRerun).toHaveBeenCalledWith(mockRows[0]);
  });

  it("calls onDelete and opens confirmation modal", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    expect(screen.getByText("Delete this experiment?")).toBeInTheDocument();
  });

  it("confirms delete from modal", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    await user.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith("1");
  });

  it("cancels delete from modal", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    await user.click(screen.getByText("Cancel"));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("hides actions column in compact mode", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} compact />
      </table>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("hides linked model column in compact mode", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} compact />
      </table>,
    );
    expect(screen.queryByText("Linked")).not.toBeInTheDocument();
    expect(screen.queryByText("Unlinked")).not.toBeInTheDocument();
  });

  it("respects rowsPerPage pagination", () => {
    renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} page={0} rowsPerPage={2} />
      </table>,
    );
    expect(screen.getByText("GPT-4 Baseline")).toBeInTheDocument();
    expect(screen.getByText("gpt-4")).toBeInTheDocument();
    expect(screen.queryByText("Failed Run")).not.toBeInTheDocument();
  });

  it("renders with empty rows", () => {
    const { container } = renderWithProviders(
      <table>
        <ExperimentTableBody {...defaultProps} rows={[]} />
      </table>,
    );
    expect(container.querySelector("tbody")?.children).toHaveLength(0);
  });
});
