import { describe, it, expect } from "@jest/globals";
import {
  parseValidFileId,
  parsePaginationQuery,
  validatePagination,
  validateTags,
  validateFileMetadataUpdate,
  PAGINATION_LIMITS,
} from "../fileManagerValidation.utils";

describe("parseValidFileId", () => {
  it("returns parsed integer for clean numeric string", () => {
    expect(parseValidFileId("42")).toBe(42);
  });

  it("returns the first element of an array param", () => {
    expect(parseValidFileId(["7", "8"])).toBe(7);
  });

  it("returns null for non-numeric input", () => {
    expect(parseValidFileId("12abc")).toBeNull();
    expect(parseValidFileId("-1")).toBeNull();
    expect(parseValidFileId("3.14")).toBeNull();
  });

  it("returns null for missing input", () => {
    expect(parseValidFileId(undefined)).toBeNull();
  });
});

describe("parsePaginationQuery", () => {
  it("coerces string params to numbers", () => {
    expect(parsePaginationQuery("3", "20")).toEqual({ page: 3, pageSize: 20 });
  });

  it("returns undefined for unparseable input", () => {
    expect(parsePaginationQuery("abc", null)).toEqual({ page: undefined, pageSize: undefined });
  });

  it("uses the first element of an array param", () => {
    expect(parsePaginationQuery(["5"], ["10", "20"])).toEqual({ page: 5, pageSize: 10 });
  });
});

describe("validatePagination", () => {
  it("returns offset for valid page + pageSize", () => {
    const result = validatePagination(3, 20);
    expect(result).toEqual({ page: 3, pageSize: 20, offset: 40 });
  });

  it("returns error when page is out of range", () => {
    const result = validatePagination(PAGINATION_LIMITS.maxPage + 1, 20);
    expect("error" in result).toBe(true);
  });

  it("returns error when pageSize exceeds max", () => {
    const result = validatePagination(1, PAGINATION_LIMITS.maxPageSize + 1);
    expect("error" in result).toBe(true);
  });

  it("returns undefined offset when either parameter missing", () => {
    const result = validatePagination(undefined, undefined) as any;
    expect(result.page).toBeUndefined();
    expect(result.pageSize).toBeUndefined();
    expect(result.offset).toBeUndefined();
  });
});

describe("validateTags", () => {
  it("returns cleaned tags array", () => {
    const result = validateTags([" foo ", "bar", ""]) as { tags: string[] };
    expect(result.tags).toEqual(["foo", "bar"]);
  });

  it("rejects non-array", () => {
    expect("error" in validateTags("foo")).toBe(true);
  });

  it("rejects more than 50 tags", () => {
    const tags = Array.from({ length: 51 }, (_, i) => `tag${i}`);
    expect("error" in validateTags(tags)).toBe(true);
  });

  it("rejects tag containing special characters", () => {
    expect("error" in validateTags(["bad/tag"])).toBe(true);
  });

  it("rejects tag exceeding 100 chars", () => {
    expect("error" in validateTags(["x".repeat(101)])).toBe(true);
  });
});

describe("validateFileMetadataUpdate", () => {
  it("accepts a fully valid payload", () => {
    const result = validateFileMetadataUpdate({
      tags: ["a", "b"],
      review_status: "approved",
      version: "1.2.3",
      expiry_date: "2026-12-31",
      description: "test",
    });
    expect("update" in result).toBe(true);
    if ("update" in result) {
      expect(result.update).toEqual({
        tags: ["a", "b"],
        review_status: "approved",
        version: "1.2.3",
        expiry_date: "2026-12-31",
        description: "test",
      });
    }
  });

  it("rejects invalid review_status", () => {
    expect("error" in validateFileMetadataUpdate({ review_status: "unknown" })).toBe(true);
  });

  it("rejects malformed version", () => {
    expect("error" in validateFileMetadataUpdate({ version: "v1" })).toBe(true);
  });

  it("rejects malformed expiry_date", () => {
    expect("error" in validateFileMetadataUpdate({ expiry_date: "2026/01/01" })).toBe(true);
  });

  it("rejects unreasonable expiry_date value", () => {
    expect("error" in validateFileMetadataUpdate({ expiry_date: "0000-13-45" })).toBe(true);
  });

  it("rejects description that exceeds 2000 chars", () => {
    expect("error" in validateFileMetadataUpdate({ description: "x".repeat(2001) })).toBe(true);
  });

  it("allows description = null (no-op)", () => {
    const result = validateFileMetadataUpdate({ description: null });
    expect("update" in result).toBe(true);
  });
});
