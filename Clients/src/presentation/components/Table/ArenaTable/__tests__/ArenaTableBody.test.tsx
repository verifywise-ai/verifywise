import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ArenaTableBody from "../ArenaTableBody";
import type { ArenaRow } from "../index";

const mockRows: ArenaRow[] = [
  {
    id: "1",
    name: "GPT-4 vs Claude",
    description: "Comparing flagship models",
    status: "completed",
    contestants: ["gpt-4-turbo", "claude-3-opus"],
    winner: "claude-3-opus",
    dataset: "datasets/customer-support.json",
    createdAt: "2025-05-01T10:00:00Z",
    completedAt: "2025-05-01T12:00:00Z",
  },
  {
    id: "2",
    name: "Llama vs Mistral",
    status: "running",
    contestants: ["llama-3-70b", "mistral-large"],
    dataset: "datasets/rag-eval.json",
    createdAt: "2025-06-01T08:00:00Z",
  },
  {
    id: "3",
    name: "Failed Battle",
    status: "failed",
    contestants: [{ name: "Player 1" }, { name: "Player 2" }],
    createdAt: "2025-04-01T08:00:00Z",
  },
  {
    id: "4",
    name: "Multi Contestant",
    status: "pending",
    contestants: ["model-a", "model-b", "model-c", "model-d", "model-e"],
    dataset: "datasets/large-test.json",
    createdAt: "2025-06-02T08:00:00Z",
  },
];

const defaultProps = {
  rows: mockRows,
  page: 0,
  rowsPerPage: 10,
};

describe("ArenaTableBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders battle names", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("GPT-4 vs Claude")).toBeInTheDocument();
    expect(screen.getByText("Llama vs Mistral")).toBeInTheDocument();
  });

  it("renders contestant names as chips", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("gpt-4-turbo")).toBeInTheDocument();
    expect(screen.getAllByText("claude-3-opus").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("llama-3-70b")).toBeInTheDocument();
  });

  it("renders contestant name from object", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Player 1")).toBeInTheDocument();
    expect(screen.getByText("Player 2")).toBeInTheDocument();
  });

  it("renders winner chip for completed battles", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getAllByText("claude-3-opus").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Running status for running battles", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getAllByText("Running...").length).toBeGreaterThanOrEqual(1);
  });

  it("renders dash for failed battles", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} />
      </table>,
    );
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders dataset name (extracted from path)", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("customer-support")).toBeInTheDocument();
    expect(screen.getByText("rag-eval")).toBeInTheDocument();
  });

  it("shows +N more for many contestants", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("+1 more")).toBeInTheDocument();
  });

  it("calls onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} onRowClick={onRowClick} />
      </table>,
    );
    await user.click(screen.getByText("GPT-4 vs Claude"));
    expect(onRowClick).toHaveBeenCalledWith(mockRows[0]);
  });

  it("opens action menu on more button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} onDelete={vi.fn()} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("shows view results only for completed battles", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} onViewResults={vi.fn()} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.getByText("View results")).toBeInTheDocument();
  });

  it("calls onViewResults from action menu", async () => {
    const onViewResults = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} onViewResults={onViewResults} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("View results"));
    expect(onViewResults).toHaveBeenCalledWith(mockRows[0]);
  });

  it("shows download and copy only for completed battles", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} onDownload={vi.fn()} onCopy={vi.fn()} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.getByText("Download results as JSON")).toBeInTheDocument();
    expect(screen.getByText("Copy results to clipboard")).toBeInTheDocument();
  });

  it("calls onDelete and opens confirmation modal", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    expect(screen.getByText("Delete Arena Battle")).toBeInTheDocument();
  });

  it("confirms delete from modal", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    await user.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(mockRows[0]);
  });

  it("cancels delete from modal", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    await user.click(screen.getByText("Cancel"));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("shows loading spinner when deleting matches row id", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} deleting="2" />
      </table>,
    );
    expect(document.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();
  });

  it("respects rowsPerPage pagination", () => {
    renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} page={0} rowsPerPage={2} />
      </table>,
    );
    expect(screen.getByText("GPT-4 vs Claude")).toBeInTheDocument();
    expect(screen.getByText("Llama vs Mistral")).toBeInTheDocument();
    expect(screen.queryByText("Failed Battle")).not.toBeInTheDocument();
  });

  it("renders with empty rows", () => {
    const { container } = renderWithProviders(
      <table>
        <ArenaTableBody {...defaultProps} rows={[]} />
      </table>,
    );
    expect(container.querySelector("tbody")?.children).toHaveLength(0);
  });
});
