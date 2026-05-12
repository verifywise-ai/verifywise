import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBulkSelection } from "../useBulkSelection";

type Row = { id: number; name: string };

const sampleRows: Row[] = [
  { id: 1, name: "a" },
  { id: 2, name: "b" },
  { id: 3, name: "c" },
];

const getId = (r: Row) => r.id;

describe("useBulkSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useBulkSelection<Row>({ rows: sampleRows, getId }));

    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.count).toBe(0);
    expect(result.current.allSelected).toBe(false);
    expect(result.current.someSelected).toBe(false);
  });

  it("toggle adds and removes a single id", () => {
    const { result } = renderHook(() => useBulkSelection<Row>({ rows: sampleRows, getId }));

    act(() => result.current.toggle(2));
    expect(result.current.isSelected(2)).toBe(true);
    expect(result.current.count).toBe(1);
    expect(result.current.someSelected).toBe(true);
    expect(result.current.allSelected).toBe(false);

    act(() => result.current.toggle(2));
    expect(result.current.isSelected(2)).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("allSelected becomes true when every visible id is selected", () => {
    const { result } = renderHook(() => useBulkSelection<Row>({ rows: sampleRows, getId }));

    act(() => {
      result.current.toggle(1);
      result.current.toggle(2);
      result.current.toggle(3);
    });

    expect(result.current.allSelected).toBe(true);
    expect(result.current.someSelected).toBe(true);
  });

  it("toggleAll selects all visible when none are selected", () => {
    const { result } = renderHook(() => useBulkSelection<Row>({ rows: sampleRows, getId }));

    act(() => result.current.toggleAll());

    expect(result.current.selectedIds.sort()).toEqual([1, 2, 3]);
    expect(result.current.allSelected).toBe(true);
  });

  it("toggleAll deselects all visible when all are selected", () => {
    const { result } = renderHook(() => useBulkSelection<Row>({ rows: sampleRows, getId }));

    act(() => result.current.toggleAll());
    act(() => result.current.toggleAll());

    expect(result.current.count).toBe(0);
    expect(result.current.allSelected).toBe(false);
  });

  it("toggleAll selects remaining visible when some are already selected", () => {
    const { result } = renderHook(() => useBulkSelection<Row>({ rows: sampleRows, getId }));

    act(() => result.current.toggle(2));
    act(() => result.current.toggleAll());

    expect(result.current.allSelected).toBe(true);
    expect(result.current.selectedIds.sort()).toEqual([1, 2, 3]);
  });

  it("clear removes everything", () => {
    const { result } = renderHook(() => useBulkSelection<Row>({ rows: sampleRows, getId }));

    act(() => result.current.toggleAll());
    act(() => result.current.clear());

    expect(result.current.count).toBe(0);
    expect(result.current.allSelected).toBe(false);
  });

  it("preserves selection across pagination but recomputes allSelected against visible rows", () => {
    const page1: Row[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ];
    const page2: Row[] = [
      { id: 3, name: "c" },
      { id: 4, name: "d" },
    ];

    const { result, rerender } = renderHook(
      ({ rows }: { rows: Row[] }) => useBulkSelection<Row>({ rows, getId }),
      { initialProps: { rows: page1 } },
    );

    act(() => result.current.toggleAll());
    expect(result.current.allSelected).toBe(true);
    expect(result.current.count).toBe(2);

    rerender({ rows: page2 });

    expect(result.current.count).toBe(2);
    expect(result.current.allSelected).toBe(false);
    expect(result.current.someSelected).toBe(false);
  });

  it("empty rows yields allSelected=false even if internal selection is non-empty", () => {
    const { result, rerender } = renderHook(
      ({ rows }: { rows: Row[] }) => useBulkSelection<Row>({ rows, getId }),
      { initialProps: { rows: sampleRows } },
    );

    act(() => result.current.toggleAll());
    rerender({ rows: [] });

    expect(result.current.allSelected).toBe(false);
    expect(result.current.someSelected).toBe(false);
    expect(result.current.count).toBe(3);
  });

  it("setAll adds every supplied id, unions with existing selection, dedupes", () => {
    const { result } = renderHook(() => useBulkSelection<Row>({ rows: sampleRows, getId }));

    act(() => result.current.toggle(2));
    act(() => result.current.setAll([1, 2, 3, 99]));

    expect(result.current.selectedIds.sort((a, b) => a - b)).toEqual([1, 2, 3, 99]);
    expect(result.current.count).toBe(4);
  });
});
