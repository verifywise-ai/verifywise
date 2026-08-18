import { renderHook, act, waitFor } from "@testing-library/react";
import type { AuditLedgerEntry, VerifyResult } from "../../../../../../application/repository/auditLedger.repository";

const mockGetAuditLedger = vi.fn();
const mockVerifyAuditLedger = vi.fn();

vi.mock("../../../../../../application/repository/auditLedger.repository", () => ({
  getAuditLedger: (...args: any[]) => mockGetAuditLedger(...args),
  verifyAuditLedger: (...args: any[]) => mockVerifyAuditLedger(...args),
}));

import { useAuditLedger } from "../useAuditLedger";

const buildEntry = (overrides: Partial<AuditLedgerEntry> = {}): AuditLedgerEntry => ({
  id: 1,
  entry_type: "event_log",
  user_id: 1,
  user_name: "Jane",
  user_surname: "Doe",
  occurred_at: "2025-01-01T00:00:00Z",
  event_type: "create",
  entity_type: "vendor",
  entity_id: 1,
  action: "create",
  field_name: null,
  old_value: null,
  new_value: null,
  description: null,
  entry_hash: "hash1",
  prev_hash: "hash0",
  ...overrides,
});

describe("useAuditLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuditLedger.mockResolvedValue({ entries: [buildEntry()], total: 1, limit: 10, offset: 0, hasMore: false });
  });

  it("fetches entries on mount", async () => {
    const { result } = renderHook(() => useAuditLedger());
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(mockGetAuditLedger).toHaveBeenCalledWith({ limit: 10, offset: 0 });
  });

  it("resets entries and total on fetch error", async () => {
    mockGetAuditLedger.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAuditLedger());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.entries).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it("includes entity_type and entry_type filters in the request", async () => {
    const { result } = renderHook(() => useAuditLedger());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateFilters({ entity_type: "vendor", entry_type: "event_log" });
    });

    await waitFor(() => {
      expect(mockGetAuditLedger).toHaveBeenLastCalledWith({
        limit: 10,
        offset: 0,
        entity_type: "vendor",
        entry_type: "event_log",
      });
    });
  });

  it("resets page to 0 when filters change", async () => {
    const { result } = renderHook(() => useAuditLedger());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleChangePage(null, 2);
    });
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => {
      result.current.updateFilters({ entity_type: "vendor" });
    });
    await waitFor(() => expect(result.current.page).toBe(0));
  });

  it("updates rowsPerPage and resets page via handleChangeRowsPerPage", async () => {
    const { result } = renderHook(() => useAuditLedger());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.handleChangeRowsPerPage({
        target: { value: "25" },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    await waitFor(() => {
      expect(result.current.rowsPerPage).toBe(25);
      expect(result.current.page).toBe(0);
    });
  });

  it("filters entries client-side by searchUser", async () => {
    mockGetAuditLedger.mockResolvedValue({
      entries: [
        buildEntry({ id: 1, user_name: "Jane", user_surname: "Doe" }),
        buildEntry({ id: 2, user_name: "John", user_surname: "Smith" }),
      ],
      total: 2,
      limit: 10,
      offset: 0,
      hasMore: false,
    });
    const { result } = renderHook(() => useAuditLedger());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateFilters({ searchUser: "john" });
    });

    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].user_name).toBe("John");
    });
  });

  it("handles missing user_name/surname gracefully when filtering", async () => {
    mockGetAuditLedger.mockResolvedValue({
      entries: [buildEntry({ user_name: null, user_surname: null })],
      total: 1,
      limit: 10,
      offset: 0,
      hasMore: false,
    });
    const { result } = renderHook(() => useAuditLedger());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateFilters({ searchUser: "nomatch" });
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(0));
  });

  it("verifies the ledger successfully", async () => {
    const verifyResult: VerifyResult = { status: "intact", totalEntries: 5 };
    mockVerifyAuditLedger.mockResolvedValue(verifyResult);
    const { result } = renderHook(() => useAuditLedger());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.verify();
    });

    expect(result.current.verifyResult).toEqual(verifyResult);
    expect(result.current.isVerifying).toBe(false);
  });

  it("sets verifyResult to null when verification fails", async () => {
    mockVerifyAuditLedger.mockRejectedValue(new Error("tamper check failed"));
    const { result } = renderHook(() => useAuditLedger());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.verify();
    });

    expect(result.current.verifyResult).toBeNull();
    expect(result.current.isVerifying).toBe(false);
  });
});
