import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomAxios from "../../../infrastructure/api/customAxios";
import {
  getAuditLedger,
  verifyAuditLedger,
  type AuditLedgerEntry,
  type AuditLedgerResponse,
  type VerifyResult,
} from "../auditLedger.repository";

vi.mock("../../../infrastructure/api/customAxios", () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const mockEntry: AuditLedgerEntry = {
  id: 1,
  entry_type: "event_log",
  user_id: 10,
  user_name: "John",
  user_surname: "Doe",
  occurred_at: "2026-03-01T00:00:00Z",
  event_type: "LOGIN",
  entity_type: "user",
  entity_id: 10,
  action: null,
  field_name: null,
  old_value: null,
  new_value: null,
  description: "User logged in",
  entry_hash: "abc123",
  prev_hash: "000000",
};

const mockLedgerResponse: AuditLedgerResponse = {
  entries: [mockEntry],
  total: 1,
  limit: 50,
  offset: 0,
  hasMore: false,
};

// ─── getAuditLedger ───────────────────────────────────────────────────────────

describe("Test Audit Ledger Repository", () => {
  describe("getAuditLedger", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request without query params when none are provided", async () => {
      const mockResponse = {
        data: { data: mockLedgerResponse },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse);

      await getAuditLedger();

      expect(CustomAxios.get).toHaveBeenCalledTimes(1);
      expect(CustomAxios.get).toHaveBeenCalledWith("/audit-ledger");
    });

    it("should append limit and offset as query params when provided", async () => {
      const mockResponse = {
        data: { data: mockLedgerResponse },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse);

      await getAuditLedger({ limit: 10, offset: 20 });

      expect(CustomAxios.get).toHaveBeenCalledWith(
        "/audit-ledger?limit=10&offset=20",
      );
    });

    it("should append entity_type and entry_type as query params when provided", async () => {
      const mockResponse = {
        data: { data: mockLedgerResponse },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse);

      await getAuditLedger({ entity_type: "user", entry_type: "event_log" });

      expect(CustomAxios.get).toHaveBeenCalledWith(
        "/audit-ledger?entity_type=user&entry_type=event_log",
      );
    });

    it("should append all query params when all are provided", async () => {
      const mockResponse = {
        data: { data: mockLedgerResponse },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse);

      await getAuditLedger({
        limit: 5,
        offset: 0,
        entity_type: "project",
        entry_type: "change_history",
      });

      expect(CustomAxios.get).toHaveBeenCalledWith(
        "/audit-ledger?limit=5&offset=0&entity_type=project&entry_type=change_history",
      );
    });

    it("should return only the nested data object on successful API call", async () => {
      const mockResponse = {
        data: { data: mockLedgerResponse },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse);

      const result = await getAuditLedger();

      expect(result).toEqual(mockLedgerResponse);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 403, data: { message: "Forbidden" } },
      };
      vi.mocked(CustomAxios.get).mockRejectedValue(mockError);

      await expect(getAuditLedger()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(
        new Error("Network timeout"),
      );

      await expect(getAuditLedger()).rejects.toThrow("Network timeout");
    });
  });

  // ─── verifyAuditLedger ────────────────────────────────────────────────────

  describe("verifyAuditLedger", () => {
    beforeEach(vi.clearAllMocks);
    afterEach(vi.clearAllMocks);

    it("should make a GET request to the verify endpoint", async () => {
      const mockResult: VerifyResult = { status: "intact", totalEntries: 10 };
      const mockResponse = {
        data: { data: mockResult },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse);

      await verifyAuditLedger();

      expect(CustomAxios.get).toHaveBeenCalledTimes(1);
      expect(CustomAxios.get).toHaveBeenCalledWith("/audit-ledger/verify");
    });

    it("should return only the nested data object on successful API call", async () => {
      const mockResult: VerifyResult = { status: "intact", totalEntries: 10 };
      const mockResponse = {
        data: { data: mockResult },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse);

      const result = await verifyAuditLedger();

      expect(result).toEqual(mockResult);
    });

    it("should return a compromised status when the ledger has been tampered", async () => {
      const compromisedResult: VerifyResult = {
        status: "compromised",
        totalEntries: 5,
        brokenAtId: 3,
        expectedHash: "abc123",
        actualHash: "xyz789",
      };
      const mockResponse = {
        data: { data: compromisedResult },
        status: 200,
        statusText: "OK",
      };
      vi.mocked(CustomAxios.get).mockResolvedValue(mockResponse);

      const result = await verifyAuditLedger();

      expect(result.status).toBe("compromised");
      expect(result.brokenAtId).toBe(3);
    });

    it("should throw an error if the API call fails", async () => {
      const mockError = {
        response: { status: 500, data: { message: "Internal Server Error" } },
      };
      vi.mocked(CustomAxios.get).mockRejectedValue(mockError);

      await expect(verifyAuditLedger()).rejects.toEqual(mockError);
    });

    it("should throw error without response property for network errors", async () => {
      vi.mocked(CustomAxios.get).mockRejectedValue(
        new Error("Connection refused"),
      );

      await expect(verifyAuditLedger()).rejects.toThrow("Connection refused");
    });
  });
});
