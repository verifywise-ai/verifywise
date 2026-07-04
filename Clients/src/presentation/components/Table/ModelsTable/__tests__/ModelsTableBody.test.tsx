import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ModelsTableBody from "../ModelsTableBody";
import type { ModelRow } from "../index";

const mockRows: ModelRow[] = [
  {
    id: "1",
    modelName: "gpt-4-turbo",
    modelProvider: "openai",
    createdAt: "2025-01-10T08:00:00Z",
    updatedAt: "2025-06-01T12:00:00Z",
  },
  {
    id: "2",
    modelName: "claude-3-opus",
    modelProvider: "anthropic",
    createdAt: "2025-02-15T10:30:00Z",
    updatedAt: "2025-05-20T09:00:00Z",
  },
  {
    id: "3",
    modelName: "gemini-pro",
    modelProvider: "google",
    updatedAt: "2025-04-10T14:00:00Z",
  },
];

const defaultProps = {
  rows: mockRows,
  page: 0,
  rowsPerPage: 10,
};

describe("ModelsTableBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders model names", () => {
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("gpt-4-turbo")).toBeInTheDocument();
    expect(screen.getByText("claude-3-opus")).toBeInTheDocument();
    expect(screen.getByText("gemini-pro")).toBeInTheDocument();
  });

  it("renders provider display names", () => {
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
  });

  it("renders formatted date", () => {
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} />
      </table>,
    );
    expect(screen.getByText(/01-06-2025/)).toBeInTheDocument();
  });

  it("calls onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} onRowClick={onRowClick} />
      </table>,
    );
    await user.click(screen.getByText("gpt-4-turbo"));
    expect(onRowClick).toHaveBeenCalledWith(mockRows[0]);
  });

  it("opens action menu on more button click", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} onDelete={vi.fn()} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("calls onDelete from action menu", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(mockRows[0]);
  });

  it("closes menu after delete", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} onDelete={onDelete} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    await user.click(screen.getByText("Delete"));
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("respects rowsPerPage pagination", () => {
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} page={0} rowsPerPage={2} />
      </table>,
    );
    expect(screen.getByText("gpt-4-turbo")).toBeInTheDocument();
    expect(screen.getByText("claude-3-opus")).toBeInTheDocument();
    expect(screen.queryByText("gemini-pro")).not.toBeInTheDocument();
  });

  it("renders with empty rows", () => {
    const { container } = renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} rows={[]} />
      </table>,
    );
    expect(container.querySelector("tbody")?.children).toHaveLength(0);
  });

  it("does not show delete button when onDelete is not provided", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} />
      </table>,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("renders provider icons", () => {
    renderWithProviders(
      <table>
        <ModelsTableBody {...defaultProps} />
      </table>,
    );
    const providerChips = screen.getAllByText(/OpenAI|Anthropic|Google/);
    expect(providerChips).toHaveLength(3);
  });
});
