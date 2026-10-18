/**
 * agent_delete_use_case never deletes a bias audit stance PDF: its files
 * delete applies the visible-file predicate.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  everyFilesReferenceFiltered,
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../../utils/files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
const statements: string[] = [];
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: (sql: string, options: any) => {
      statements.push(sql);
      return /\bFROM\s+files\b/.test(sql) ? fakeFilesQuery(table)(sql, options) : [[], 0];
    },
  },
}));
jest.mock("../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../utils/project.utils", () => ({}));
jest.mock("../../utils/user.utils", () => ({}));

import "./useCaseFunctions";
import { writeToolExecutors } from "../confirmation/createWriteTool";

describe("agent_delete_use_case and bias audit stance PDFs", () => {
  beforeEach(() => {
    table = [];
    statements.length = 0;
  });

  it("deletes the use case's other files but never its stance PDF", async () => {
    // The fake keys rows on the :id replacement, which here is the use case
    // id, so both rows carry that id; project_id is not modelled.
    table = [visibleRow({ id: 7 }), stanceRow({ id: 7 })];
    await writeToolExecutors.get("agent_delete_use_case")!({ use_case_id: 7 }, 1);
    expect(table).toEqual([stanceRow({ id: 7 })]);
    const fileDeletes = statements.filter((sql) => /DELETE FROM files/.test(sql));
    expect(fileDeletes).toHaveLength(1);
    expect(everyFilesReferenceFiltered(fileDeletes[0])).toBe(true);
  });
});
