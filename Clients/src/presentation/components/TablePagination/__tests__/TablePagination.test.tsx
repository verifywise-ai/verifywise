import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import TablePaginationActions from "../index";

describe("TablePaginationActions", () => {
  const defaultProps = {
    count: 50,
    page: 2,
    rowsPerPage: 10,
    onPageChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all navigation buttons", () => {
    renderWithProviders(<TablePaginationActions {...defaultProps} />);
    expect(screen.getByLabelText("first page")).toBeInTheDocument();
    expect(screen.getByLabelText("previous page")).toBeInTheDocument();
    expect(screen.getByLabelText("next page")).toBeInTheDocument();
    expect(screen.getByLabelText("last page")).toBeInTheDocument();
  });

  it("calls onPageChange with 0 when first page is clicked", () => {
    renderWithProviders(<TablePaginationActions {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("first page"));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(expect.anything(), 0);
  });

  it("calls onPageChange with page - 1 when previous is clicked", () => {
    renderWithProviders(<TablePaginationActions {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("previous page"));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(expect.anything(), 1);
  });

  it("calls onPageChange with page + 1 when next is clicked", () => {
    renderWithProviders(<TablePaginationActions {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("next page"));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(expect.anything(), 3);
  });

  it("calls onPageChange with last page index when last is clicked", () => {
    renderWithProviders(<TablePaginationActions {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("last page"));
    expect(defaultProps.onPageChange).toHaveBeenCalledWith(expect.anything(), 4);
  });

  it("disables first and previous buttons on the first page", () => {
    renderWithProviders(<TablePaginationActions {...defaultProps} page={0} />);
    expect(screen.getByLabelText("first page")).toBeDisabled();
    expect(screen.getByLabelText("previous page")).toBeDisabled();
  });

  it("disables next and last buttons on the last page", () => {
    renderWithProviders(<TablePaginationActions {...defaultProps} page={4} />);
    expect(screen.getByLabelText("next page")).toBeDisabled();
    expect(screen.getByLabelText("last page")).toBeDisabled();
  });
});
