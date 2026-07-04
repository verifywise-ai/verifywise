import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import DatasetsTableBody from "../DatasetsTableBody";
import type { DatasetRow } from "../index";

const mockRows: DatasetRow[] = [
  {
    key: "ds-1",
    name: "Customer Support QA",
    path: "/datasets/customer-support.jsonl",
    type: "single-turn",
    useCase: "chatbot",
    createdAt: "2025-02-10T08:00:00Z",
    metadata: { promptCount: 150, avgDifficulty: "Medium" },
  },
  {
    key: "ds-2",
    name: "RAG Evaluation Set",
    path: "/datasets/rag-eval.jsonl",
    type: "multi-turn",
    useCase: "rag",
    createdAt: "2025-03-15T10:30:00Z",
    metadata: { promptCount: 75, avgDifficulty: "Hard" },
  },
  {
    key: "ds-3",
    name: "Simulated User Data",
    path: "/datasets/simulated.jsonl",
    type: "simulated",
    useCase: "agent",
    createdAt: "2025-04-20T12:00:00Z",
    metadata: { promptCount: 0, avgDifficulty: "Easy" },
  },
];

const defaultProps = {
  rows: mockRows,
  page: 0,
  rowsPerPage: 10,
};

describe("DatasetsTableBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all rows", () => {
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Customer Support QA")).toBeInTheDocument();
    expect(screen.getByText("RAG Evaluation Set")).toBeInTheDocument();
    expect(screen.getByText("Simulated User Data")).toBeInTheDocument();
  });

  it("renders single-turn chip", () => {
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Single-Turn")).toBeInTheDocument();
  });

  it("renders multi-turn chip", () => {
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Multi-Turn")).toBeInTheDocument();
  });

  it("renders simulated chip", () => {
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Simulated")).toBeInTheDocument();
  });

  it("renders use case chips", () => {
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Chatbot")).toBeInTheDocument();
    expect(screen.getByText("RAG")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("renders prompt count", () => {
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("renders Empty chip when prompt count is 0", () => {
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });

  it("renders difficulty chips", () => {
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Hard")).toBeInTheDocument();
    expect(screen.getByText("Easy")).toBeInTheDocument();
  });

  it("calls onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} onRowClick={onRowClick} />
      </table>,
    );
    await user.click(screen.getByText("Customer Support QA"));
    expect(onRowClick).toHaveBeenCalledWith(mockRows[0]);
  });

  it("opens action menu and shows all actions", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <DatasetsTableBody
          {...defaultProps}
          onView={vi.fn()}
          onEdit={vi.fn()}
          onDownload={vi.fn()}
          onDelete={vi.fn()}
        />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.getByText("View prompts")).toBeInTheDocument();
    expect(screen.getByText("Open in editor")).toBeInTheDocument();
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onView from action menu", async () => {
    const onView = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} onView={onView} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("View prompts"));
    expect(onView).toHaveBeenCalledWith(mockRows[0]);
  });

  it("calls onEdit from action menu", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} onEdit={onEdit} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Open in editor"));
    expect(onEdit).toHaveBeenCalledWith(mockRows[0]);
  });

  it("calls onDownload from action menu", async () => {
    const onDownload = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} onDownload={onDownload} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Download"));
    expect(onDownload).toHaveBeenCalledWith(mockRows[0]);
  });

  it("calls onDelete from action menu", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(mockRows[0]);
  });

  it("renders dash when type is missing", () => {
    const rowsWithoutType = [{ ...mockRows[0], key: "ds-4", type: undefined }];
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} rows={rowsWithoutType} />
      </table>,
    );
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(1);
  });

  it("renders dash when useCase is missing", () => {
    const rowsWithoutUseCase = [{ ...mockRows[0], key: "ds-5", useCase: undefined }];
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} rows={rowsWithoutUseCase} />
      </table>,
    );
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(1);
  });

  it("respects rowsPerPage pagination", () => {
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} page={0} rowsPerPage={2} />
      </table>,
    );
    expect(screen.getByText("Customer Support QA")).toBeInTheDocument();
    expect(screen.getByText("RAG Evaluation Set")).toBeInTheDocument();
    expect(screen.queryByText("Simulated User Data")).not.toBeInTheDocument();
  });

  it("renders loading spinner in prompt count when metadata.loading is true", () => {
    const loadingRow = [
      {
        ...mockRows[0],
        key: "ds-loading",
        metadata: { loading: true, promptCount: 0 },
      },
    ];
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} rows={loadingRow} />
      </table>,
    );
    expect(document.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();
  });

  it("renders loading spinner in difficulty when metadata.loading is true", () => {
    const loadingRow = [
      {
        ...mockRows[0],
        key: "ds-loading2",
        metadata: { loading: true },
      },
    ];
    renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} rows={loadingRow} />
      </table>,
    );
    const spinners = document.querySelectorAll(".MuiCircularProgress-root");
    expect(spinners.length).toBeGreaterThanOrEqual(2);
  });

  it("renders with empty rows", () => {
    const { container } = renderWithProviders(
      <table>
        <DatasetsTableBody {...defaultProps} rows={[]} />
      </table>,
    );
    expect(container.querySelector("tbody")?.children).toHaveLength(0);
  });
});
