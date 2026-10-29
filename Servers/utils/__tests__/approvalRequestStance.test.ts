/**
 * File approval requests never read or write a bias audit stance PDF.
 *
 * Creating a request with entity_type 'file' does not look the file up, so a
 * stance id is accepted exactly as a missing id is. What must hold is that
 * the request's detail never shows the stance file, and approving or
 * rejecting it never changes the stance row: the same as for a missing id.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  everyFilesReferenceFiltered,
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
let approvalResult = "Approved";
const statements: Array<{ sql: string; options: any }> = [];

/** Answers the approval-table reads; anything touching files goes to the fake. */
function route(sql: string, options: any): unknown {
  statements.push({ sql, options });
  if (/\b(?:FROM|JOIN|UPDATE)\s+files\b/.test(sql) && !/FROM approval_requests ar/.test(sql)) {
    return fakeFilesQuery(table)(sql, options);
  }
  if (sql.includes("SELECT * FROM approval_requests")) {
    return [
      {
        id: 1,
        status: "Pending",
        current_step: 1,
        entity_type: "file",
        entity_id: 2,
        requested_by: 9,
        request_name: "Review",
      },
    ];
  }
  if (sql.includes("SELECT * FROM approval_request_steps")) return [{ id: 11 }];
  if (sql.includes("requires_all_approvers")) return [{ requires_all_approvers: true }];
  // The caller is a pending approver of the current step.
  if (sql.includes("SELECT approval_result")) return [{ approval_result: "Pending" }];
  if (sql.includes("SELECT approver_id"))
    return [{ approver_id: 1, approval_result: approvalResult }];
  if (sql.includes("COUNT(*) as count")) return [{ count: "1" }];
  return [];
}

jest.mock("../../database/db", () => ({
  sequelize: { query: async (sql: string, options: any) => route(sql, options) },
}));
jest.mock("../../advisor/aiActions", () => ({ executeAiAction: jest.fn() }));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
  logStructured: jest.fn(),
}));

import { ApprovalResult } from "../../domain.layer/enums/approval-workflow.enum";
import { getApprovalRequestByIdQuery, processApprovalQuery } from "../approvalRequest.utils";

const tx = {} as any;

describe("file approval requests and bias audit stance PDFs", () => {
  beforeEach(() => {
    table = [];
    statements.length = 0;
  });

  it("approving a request for a visible file still marks it approved (sanity)", async () => {
    approvalResult = ApprovalResult.APPROVED;
    table = [visibleRow({ id: 2 })];
    await processApprovalQuery(1, 1, ApprovalResult.APPROVED, undefined, 1, tx);
    expect(table[0].updated).toBe(1);
  });

  it.each([ApprovalResult.APPROVED, ApprovalResult.REJECTED])(
    "%s leaves a stance PDF untouched and answers as for a missing file",
    async (result) => {
      approvalResult = result;
      table = [stanceRow()];
      const stance = await processApprovalQuery(1, 1, result, undefined, 1, tx);
      expect(table).toEqual([stanceRow()]);
      table = [];
      const missing = await processApprovalQuery(1, 1, result, undefined, 1, tx);
      expect(stance).toEqual(missing);
      const fileWrites = statements.filter(({ sql }) => /UPDATE files/.test(sql));
      expect(fileWrites).toHaveLength(2);
      for (const { sql } of fileWrites) expect(everyFilesReferenceFiltered(sql)).toBe(true);
    },
  );

  it("the request detail joins only visible files", async () => {
    await getApprovalRequestByIdQuery(1, 1, tx).catch(() => undefined);
    const detail = statements.find(({ sql }) => /FROM approval_requests ar/.test(sql))!;
    expect(detail.sql).toMatch(/LEFT JOIN files f/);
    expect(everyFilesReferenceFiltered(detail.sql)).toBe(true);
    expect(detail.options.replacements.stanceSource).toBe("Bias audit stance report");
  });
});
