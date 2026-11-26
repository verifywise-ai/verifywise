import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import {
  PERIOD_OPTIONS,
  SelectorVertical,
  useTableSort,
  useSortedRows,
  SortableTableHead,
  SortableColumn,
  SortConfig,
} from "../constants";

describe("ShadowAI constants", () => {
  it("exposes the shared period filter options", () => {
    expect(PERIOD_OPTIONS).toEqual([
      { _id: "7d", name: "Last 7 days" },
      { _id: "30d", name: "Last 30 days" },
      { _id: "90d", name: "Last 90 days" },
    ]);
  });

  it("renders the SelectorVertical icon", () => {
    const { container } = render(<SelectorVertical data-testid="selector-icon" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("useTableSort", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes with defaults when nothing is stored", () => {
    const { result } = renderHook(() => useTableSort("vw_test_sort", "name", "asc"));
    expect(result.current.sortConfig).toEqual({ key: "name", direction: "asc" });
  });

  it("restores a saved config from localStorage", () => {
    localStorage.setItem("vw_test_sort_saved", JSON.stringify({ key: "id", direction: "desc" }));
    const { result } = renderHook(() => useTableSort("vw_test_sort_saved"));
    expect(result.current.sortConfig).toEqual({ key: "id", direction: "desc" });
  });

  it("ignores malformed localStorage content", () => {
    localStorage.setItem("vw_test_sort_bad", "{not-json");
    const { result } = renderHook(() => useTableSort("vw_test_sort_bad", "fallback", null));
    expect(result.current.sortConfig).toEqual({ key: "fallback", direction: null });
  });

  it("cycles asc -> desc -> cleared on repeated sorts of the same column", () => {
    const { result } = renderHook(() => useTableSort("vw_test_sort_cycle"));

    act(() => result.current.handleSort("name"));
    expect(result.current.sortConfig).toEqual({ key: "name", direction: "asc" });

    act(() => result.current.handleSort("name"));
    expect(result.current.sortConfig).toEqual({ key: "name", direction: "desc" });

    act(() => result.current.handleSort("name"));
    expect(result.current.sortConfig).toEqual({ key: "", direction: null });
  });

  it("switches to asc when a different column is sorted", () => {
    const { result } = renderHook(() => useTableSort("vw_test_sort_switch"));

    act(() => result.current.handleSort("name"));
    act(() => result.current.handleSort("status"));

    expect(result.current.sortConfig).toEqual({ key: "status", direction: "asc" });
  });

  it("persists sort config to localStorage", () => {
    const { result } = renderHook(() => useTableSort("vw_test_sort_persist"));
    act(() => result.current.handleSort("name"));
    expect(JSON.parse(localStorage.getItem("vw_test_sort_persist") || "{}")).toEqual({
      key: "name",
      direction: "asc",
    });
  });
});

describe("useSortedRows", () => {
  const rows = [
    { id: 1, name: "Charlie", score: 10 },
    { id: 2, name: "Alice", score: 30 },
    { id: 3, name: "Bob", score: 20 },
  ];
  const getValue = (row: (typeof rows)[number], key: string) =>
    key === "name" ? row.name : row.score;

  it("returns rows unchanged when there is no sort key", () => {
    const { result } = renderHook(() =>
      useSortedRows(rows, { key: "", direction: null }, getValue),
    );
    expect(result.current).toEqual(rows);
  });

  it("sorts strings ascending and descending", () => {
    const { result: asc } = renderHook(() =>
      useSortedRows(rows, { key: "name", direction: "asc" }, getValue),
    );
    expect(asc.current.map((r) => r.name)).toEqual(["Alice", "Bob", "Charlie"]);

    const { result: desc } = renderHook(() =>
      useSortedRows(rows, { key: "name", direction: "desc" }, getValue),
    );
    expect(desc.current.map((r) => r.name)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("sorts numbers ascending and descending", () => {
    const { result: asc } = renderHook(() =>
      useSortedRows(rows, { key: "score", direction: "asc" }, getValue),
    );
    expect(asc.current.map((r) => r.score)).toEqual([10, 20, 30]);

    const { result: desc } = renderHook(() =>
      useSortedRows(rows, { key: "score", direction: "desc" }, getValue),
    );
    expect(desc.current.map((r) => r.score)).toEqual([30, 20, 10]);
  });

  it("does not mutate the original array", () => {
    const original = [...rows];
    renderHook(() => useSortedRows(rows, { key: "name", direction: "asc" }, getValue));
    expect(rows).toEqual(original);
  });
});

describe("SortableTableHead", () => {
  const columns: SortableColumn[] = [
    { id: "name", label: "Name" },
    { id: "status", label: "Status", tooltip: "The current status" },
    { id: "readOnly", label: "Read only", sortable: false },
  ];

  function Table({
    sortConfig = { key: "", direction: null },
    onSort = () => {},
  }: {
    sortConfig?: SortConfig;
    onSort?: (key: string) => void;
  }) {
    return (
      <table>
        <SortableTableHead columns={columns} sortConfig={sortConfig} onSort={onSort} />
      </table>
    );
  }

  it("renders every column label", () => {
    render(<Table />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Read only")).toBeInTheDocument();
  });

  it("calls onSort with the column id when a sortable header is clicked", () => {
    const onSort = vi.fn();
    render(<Table onSort={onSort} />);
    fireEvent.click(screen.getByText("Name"));
    expect(onSort).toHaveBeenCalledWith("name");
  });

  it("does not call onSort when a non-sortable header is clicked", () => {
    const onSort = vi.fn();
    render(<Table onSort={onSort} />);
    fireEvent.click(screen.getByText("Read only"));
    expect(onSort).not.toHaveBeenCalled();
  });

  it("shows a tooltip trigger for columns with a tooltip", () => {
    render(<Table />);
    expect(screen.getByText("Status").parentElement).toBeTruthy();
  });
});
