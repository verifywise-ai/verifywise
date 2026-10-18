/**
 * agent_delete_use_case deletes every file of the use case, bias audit stance
 * PDFs included, as the normal project delete does: the stances citing them
 * cascade with the project, so a kept PDF would be an orphan. Files of other
 * projects and organizations are untouched.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../../utils/files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
jest.mock("../../database/db", () => ({
  sequelize: {
    transaction: jest.fn<any>().mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() }),
    query: (sql: string, options: any) =>
      /\bFROM\s+files\b/.test(sql) ? fakeFilesQuery(table)(sql, options) : [[], 0],
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

describe("agent_delete_use_case and the use case's files", () => {
  beforeEach(() => {
    table = [];
  });

  it("deletes all of the use case's files, stance PDFs included, and nothing else", async () => {
    const otherProject = visibleRow({ id: 3, project_id: 8 });
    const otherProjectStance = stanceRow({ id: 4, project_id: 8 });
    const otherOrg = visibleRow({ id: 5, project_id: 7, organization_id: 2 });
    table = [
      visibleRow({ id: 1, project_id: 7 }),
      stanceRow({ id: 2, project_id: 7 }),
      otherProject,
      otherProjectStance,
      otherOrg,
    ];
    await writeToolExecutors.get("agent_delete_use_case")!({ use_case_id: 7 }, 1);
    expect(table).toEqual([otherProject, otherProjectStance, otherOrg]);
  });
});
