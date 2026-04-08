import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFilterBy } from "../useFilterBy";

type Item = {
  name?: string | null;
  status?: string | null;
  count?: number | null;
  dueDate?: Date | string | number | null;
};

const getFieldValue = (item: Item, fieldId: string) => {
  switch (fieldId) {
    case "name":
      return item.name ?? null;
    case "status":
      return item.status ?? null;
    case "count":
      return item.count ?? null;
    case "dueDate":
      return item.dueDate ?? null;
    default:
      return null;
  }
};

describe("useFilterBy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // fixa o "agora" para termos testes determinísticos
    vi.setSystemTime(new Date("2026-02-20T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should initialize with empty conditions, logic 'and', activeFilterCount 0, and return data unchanged", () => {
    const { result } = renderHook(() => useFilterBy<Item>(getFieldValue));

    expect(result.current.conditions).toEqual([]);
    expect(result.current.logic).toBe("and");
    expect(result.current.activeFilterCount).toBe(0);

    const data: Item[] = [{ name: "A" }, { name: "B" }];
    expect(result.current.filterData(data)).toBe(data); // sem filtros => retorna o mesmo array
  });

  it("handleFilterChange should update conditions and logic", () => {
    const { result } = renderHook(() => useFilterBy<Item>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "name", operator: "contains", value: "al" } as any],
        "or"
      );
    });

    expect(result.current.logic).toBe("or");
    expect(result.current.conditions).toEqual([
      { columnId: "name", operator: "contains", value: "al" },
    ]);
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("should ignore conditions without value unless operator is a NO_VALUE operator", () => {
    const { result } = renderHook(() => useFilterBy<Item>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [
          { columnId: "name", operator: "contains", value: "" } as any, // sem value => inativo
          { columnId: "status", operator: "is_empty", value: "" } as any, // NO_VALUE => ativo
        ],
        "and"
      );
    });

    expect(result.current.activeFilterCount).toBe(1);

    const data: Item[] = [
      { name: "alpha", status: "" },
      { name: "beta", status: "ok" },
      { name: "gamma", status: null },
    ];

    const filtered = result.current.filterData(data);
    // status is_empty => status falsy ou ""
    expect(filtered).toEqual([{ name: "alpha", status: "" }, { name: "gamma", status: null }]);
  });

  it("text operators should work: is, is_not, contains, does_not_contain", () => {
    const data: Item[] = [
      { name: "Alpha", status: "Open" },
      { name: "Beta", status: "Closed" },
      { name: "Gamma", status: "open" },
    ];

    const { result } = renderHook(() => useFilterBy<Item>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "status", operator: "is", value: "open" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data)).toEqual([
      { name: "Alpha", status: "Open" },
      { name: "Gamma", status: "open" },
    ]);

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "name", operator: "contains", value: "et" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data)).toEqual([{ name: "Beta", status: "Closed" }]);

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "name", operator: "does_not_contain", value: "a" } as any],
        "and"
      );
    });
    // "Alpha" contém "a" (case-insensitive), "Beta" contém, "Gamma" contém => nenhum
    expect(result.current.filterData(data)).toEqual([]);

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "status", operator: "is_not", value: "open" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data)).toEqual([{ name: "Beta", status: "Closed" }]);
  });

  it("is_empty / is_not_empty should handle null/undefined/empty string", () => {
    const data: Item[] = [
      { name: "" },
      { name: null },
      { name: "x" },
      {},
    ];

    const { result } = renderHook(() => useFilterBy<Item>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "name", operator: "is_empty", value: "" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data)).toEqual([{ name: "" }, { name: null }, {}]);

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "name", operator: "is_not_empty", value: "" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data)).toEqual([{ name: "x" }]);
  });

  it("should apply multiple conditions with logic 'and'", () => {
    const data: Item[] = [
      { name: "Alpha", status: "open" },
      { name: "Alpha", status: "closed" },
      { name: "Beta", status: "open" },
    ];

    const { result } = renderHook(() => useFilterBy<Item>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [
          { columnId: "name", operator: "is", value: "alpha" } as any,
          { columnId: "status", operator: "is", value: "open" } as any,
        ],
        "and"
      );
    });

    expect(result.current.filterData(data)).toEqual([{ name: "Alpha", status: "open" }]);
  });

  it("should apply multiple conditions with logic 'or'", () => {
    const data: Item[] = [
      { name: "Alpha", status: "open" },
      { name: "Alpha", status: "closed" },
      { name: "Beta", status: "open" },
      { name: "Gamma", status: "closed" },
    ];

    const { result } = renderHook(() => useFilterBy<Item>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [
          { columnId: "name", operator: "is", value: "gamma" } as any,
          { columnId: "status", operator: "is", value: "open" } as any,
        ],
        "or"
      );
    });

    expect(result.current.filterData(data)).toEqual([
      { name: "Alpha", status: "open" },
      { name: "Beta", status: "open" },
      { name: "Gamma", status: "closed" },
    ]);
  });

  it("date operators should work: is_today, is_past, in_1_day, in_7_days, in_2_weeks, in_30_days", () => {
    // agora fixo: 2026-02-20T12:00:00Z
    const today = new Date("2026-02-20T18:00:00Z"); // ainda 20
    const tomorrow = new Date("2026-02-21T18:00:00Z");
    const in7 = new Date("2026-02-27T18:00:00Z");
    const in14 = new Date("2026-03-06T18:00:00Z");
    const in30 = new Date("2026-03-22T18:00:00Z");
    const past = new Date("2026-02-10T12:00:00Z");

    const data: Item[] = [
      { name: "T", dueDate: today },
      { name: "T+1", dueDate: tomorrow },
      { name: "T+7", dueDate: in7 },
      { name: "T+14", dueDate: in14 },
      { name: "T+30", dueDate: in30 },
      { name: "Past", dueDate: past },
      { name: "Bad", dueDate: "not-a-date" },
      { name: "Null", dueDate: null },
    ];

    const { result } = renderHook(() => useFilterBy<Item>(getFieldValue));

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "dueDate", operator: "is_today", value: "" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data).map((d) => d.name)).toEqual(["T"]);

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "dueDate", operator: "is_past", value: "" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data).map((d) => d.name)).toEqual(["Past"]);

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "dueDate", operator: "in_1_day", value: "" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data).map((d) => d.name)).toEqual(["T", "T+1"]);

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "dueDate", operator: "in_7_days", value: "" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data).map((d) => d.name)).toEqual(["T", "T+1", "T+7"]);

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "dueDate", operator: "in_2_weeks", value: "" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data).map((d) => d.name)).toEqual(["T", "T+1", "T+7", "T+14"]);

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "dueDate", operator: "in_30_days", value: "" } as any],
        "and"
      );
    });
    expect(result.current.filterData(data).map((d) => d.name)).toEqual([
      "T",
      "T+1",
      "T+7",
      "T+14",
      "T+30",
    ]);
  });

  it("should return true for unknown text operator (covers default text branch)", () => {
    const { result } = renderHook(() => useFilterBy<any>((item, fieldId) => item[fieldId]));

    const data = [{ name: "alpha" }, { name: "beta" }];

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "name", operator: "unknown_text_op" as any, value: "x" } as any],
        "and"
      );
    });

    expect(result.current.filterData(data)).toEqual(data);
  });

  it("should return true for unknown date operator when DATE_OPERATORS.includes is forced (covers default date branch)", () => {
    const originalIncludes = Array.prototype.includes;

    const includesSpy = vi
      .spyOn(Array.prototype, "includes")
      .mockImplementation(function (this: any[], searchElement: any, fromIndex?: number) {
        const looksLikeDateOperators =
          Array.isArray(this) &&
          this.length === 6 &&
          this[0] === "in_1_day" &&
          this[1] === "in_7_days";

        if (looksLikeDateOperators && searchElement === "unknown_date_op") {
          return true; 
        }

        return originalIncludes.call(this, searchElement, fromIndex as any);
      });

    const { result } = renderHook(() => useFilterBy<any>((item, fieldId) => item[fieldId]));

    const data = [
      { dueDate: new Date("2026-02-20T12:00:00Z") },
      { dueDate: new Date("2026-02-10T12:00:00Z") },
    ];

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "dueDate", operator: "unknown_date_op" as any, value: "x" } as any],
        "and"
      );
    });

    expect(result.current.filterData(data)).toEqual(data);

    includesSpy.mockRestore();
  });

  it("should include items when date value is a parseable string (covers parseDate valid branch)", () => {
    const { result } = renderHook(() => useFilterBy<any>((item, fieldId) => item[fieldId]));

    const data = [
      { name: "ok", dueDate: "2026-02-20T10:00:00Z" }, 
      { name: "bad", dueDate: "not-a-date" },         
    ];

    act(() => {
      result.current.handleFilterChange(
        [{ columnId: "dueDate", operator: "is_today", value: "" } as any],
        "and"
      );
    });

    expect(result.current.filterData(data).map((x: any) => x.name)).toEqual(["ok"]);
  });
});