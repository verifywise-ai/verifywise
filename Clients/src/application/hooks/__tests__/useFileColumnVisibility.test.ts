import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import {
  useFileColumnVisibility,
  DEFAULT_COLUMNS,
  type FileColumn,
} from "../useFileColumnVisibility";

const STORAGE_KEY = "verifywise:file-column-visibility";
const VERSION_KEY = "verifywise:file-column-visibility-version";
const SCHEMA_VERSION = "3";

const ALWAYS_VISIBLE_KEYS: FileColumn[] = DEFAULT_COLUMNS.filter((c) => c.alwaysVisible).map(
  (c) => c.key
);

const ALL_KEYS: FileColumn[] = DEFAULT_COLUMNS.map((c) => c.key);

describe("useFileColumnVisibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should initialize with defaults on first visit and set schema version", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    expect(Array.from(result.current.visibleColumns).sort()).toEqual([...ALL_KEYS].sort());
    expect(localStorage.getItem(VERSION_KEY)).toBe(SCHEMA_VERSION);
  });

  it("should load from localStorage, drop invalid keys, and force always-visible columns", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["upload_date", "bad_key"]));
    localStorage.setItem(VERSION_KEY, SCHEMA_VERSION);

    const { result } = renderHook(() => useFileColumnVisibility());

    expect(result.current.visibleColumns.has("upload_date")).toBe(true);
    expect(result.current.visibleColumns.has("bad_key" as any)).toBe(false);

    for (const k of ALWAYS_VISIBLE_KEYS) {
      expect(result.current.visibleColumns.has(k)).toBe(true);
    }

    expect(result.current.visibleColumnKeys).toEqual(["file", "upload_date", "action"]);
  });

  it("should upgrade schema when stored version is older and add missing defaultVisible columns", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["upload_date"]));
    localStorage.setItem(VERSION_KEY, "0"); // < 3 => upgrade

    const { result } = renderHook(() => useFileColumnVisibility());

    expect(Array.from(result.current.visibleColumns).sort()).toEqual([...ALL_KEYS].sort());
    expect(localStorage.getItem(VERSION_KEY)).toBe(SCHEMA_VERSION);
  });

  it("should fall back to defaults if localStorage contains invalid JSON and log error", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    localStorage.setItem(STORAGE_KEY, "not-json");

    const { result } = renderHook(() => useFileColumnVisibility());

    expect(Array.from(result.current.visibleColumns).sort()).toEqual([...ALL_KEYS].sort());
    expect(localStorage.getItem(VERSION_KEY)).toBe(SCHEMA_VERSION);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain(
      "Error loading column visibility from localStorage"
    );
  });

  it("toggleColumn should NOT hide always-visible columns, but should toggle normal columns", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    act(() => {
      result.current.toggleColumn("file");
    });
    expect(result.current.visibleColumns.has("file")).toBe(true);

    act(() => {
      result.current.toggleColumn("status");
    });
    expect(result.current.visibleColumns.has("status")).toBe(false);

    act(() => {
      result.current.toggleColumn("status");
    });
    expect(result.current.visibleColumns.has("status")).toBe(true);
  });

  it("setColumnVisible should NOT hide always-visible columns, but should set normal columns", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    act(() => {
      result.current.setColumnVisible("action", false);
    });
    expect(result.current.visibleColumns.has("action")).toBe(true);

    act(() => {
      result.current.setColumnVisible("status", false);
    });
    expect(result.current.visibleColumns.has("status")).toBe(false);

    act(() => {
      result.current.setColumnVisible("status", true);
    });
    expect(result.current.visibleColumns.has("status")).toBe(true);
  });

  it("resetToDefaults should restore defaultVisible columns", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    act(() => {
      result.current.setColumnVisible("status", false);
    });
    expect(result.current.visibleColumns.has("status")).toBe(false);

    act(() => {
      result.current.resetToDefaults();
    });

    expect(Array.from(result.current.visibleColumns).sort()).toEqual([...ALL_KEYS].sort());
  });

  it("isColumnVisible should return true/false based on current state", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    expect(result.current.isColumnVisible("status")).toBe(true);

    act(() => {
      result.current.setColumnVisible("status", false);
    });
    expect(result.current.isColumnVisible("status")).toBe(false);

    act(() => {
      result.current.setColumnVisible("file", false);
    });
    expect(result.current.isColumnVisible("file")).toBe(true);
  });

  it("should log error when saving to localStorage fails (persist catch branch)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const originalSetItem = Storage.prototype.setItem;

    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(function (this: Storage, key: string, value: string) {
        if (setItemSpy.mock.calls.length < 2) {
          return originalSetItem.call(this, key, value);
        }
        throw new Error("Quota exceeded");
      });

    const { result } = renderHook(() => useFileColumnVisibility());

    act(() => {
      result.current.setColumnVisible("status", false);
    });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(
        "Error saving column visibility to localStorage:"
      );
    });
  });

  it("should treat missing VERSION_KEY as version 0 (covers VERSION_KEY || '0')", () => {

    localStorage.setItem(STORAGE_KEY, JSON.stringify(["upload_date"]));

    const { result } = renderHook(() => useFileColumnVisibility());

    expect(localStorage.getItem(VERSION_KEY)).toBe(SCHEMA_VERSION);

    expect(Array.from(result.current.visibleColumns).sort()).toEqual([...ALL_KEYS].sort());

    expect(result.current.visibleColumns.has("upload_date")).toBe(true);
  });

  it("getTableColumns should return only visible columns with sequential ids and correct names", () => {
    const { result } = renderHook(() => useFileColumnVisibility());

    act(() => {
      for (const key of ALL_KEYS) {
        if (key !== "file" && key !== "upload_date" && key !== "action") {
          result.current.setColumnVisible(key, false);
        }
      }
    });

    const tableCols = result.current.getTableColumns();

    expect(tableCols.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(tableCols.map((c) => c.name)).toEqual(["File", "Upload date", "Action"]);

    for (const col of tableCols) {
      expect(col.sx).toEqual({
        minWidth: "fit-content",
        width: "fit-content",
        maxWidth: "50%",
      });
    }
  });
});