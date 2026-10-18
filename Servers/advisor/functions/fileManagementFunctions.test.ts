/**
 * AI Advisor file management tools keep bias audit stance PDFs out.
 *
 * A stance PDF is served only by the bias audit stance endpoint. Every tool
 * here must answer a stance PDF exactly as a missing file: the same answer
 * over a table holding only a stance PDF as over an empty one, and no write
 * may touch the stance row.
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
  sequelize: { query: (sql: string, options: any) => fakeFilesQuery(table)(sql, options) },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.mock("../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));

const mockAssign = jest.fn<any>().mockResolvedValue(1);
jest.mock("../../utils/virtualFolder.utils", () => ({
  createFolderQuery: jest.fn(),
  assignFilesToFolderQuery: (...args: any[]) => mockAssign(...args),
  removeFileFromFolderQuery: jest.fn(),
}));

import { availableFileManagementTools as tools } from "./fileManagementFunctions";
import { writeToolExecutors } from "../confirmation/createWriteTool";

const ORG = 1;
const STANCE_ID = 2;

/** The tool's answer over a table holding only a stance PDF, and over an empty one. */
async function stanceAndMissing(run: () => Promise<unknown>) {
  table = [stanceRow()];
  const stance = await run().catch((e: Error) => ({ thrown: e.message }));
  table = [];
  const missing = await run().catch((e: Error) => ({ thrown: e.message }));
  return { stance, missing };
}

describe("advisor file tools and bias audit stance PDFs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    table = [];
  });

  it("the fake table still returns a visible file (sanity)", async () => {
    table = [visibleRow()];
    const result: any = await tools.fetch_files({}, ORG);
    expect(result.total).toBe(1);
  });

  it.each([
    ["fetch_files with no filter", () => tools.fetch_files({}, ORG)],
    ["fetch_files by project", () => tools.fetch_files({ project_id: 5 }, ORG)],
    [
      "fetch_files by entity_type",
      () => tools.fetch_files({ entity_type: "Bias audit stance report" }, ORG),
    ],
    ["get_file_detail", () => tools.get_file_detail({ file_id: STANCE_ID }, ORG)],
    [
      "get_files_by_entity",
      () =>
        tools.get_files_by_entity({ entity_type: "Bias audit stance report", entity_id: 5 }, ORG),
    ],
    ["get_file_change_history", () => tools.get_file_change_history({ file_id: STANCE_ID }, ORG)],
    ["get_file_analytics", () => tools.get_file_analytics({}, ORG)],
    ["get_file_executive_summary", () => tools.get_file_executive_summary({}, ORG)],
  ])("%s answers a stance PDF as a missing file", async (_name, run) => {
    const { stance, missing } = await stanceAndMissing(run as () => Promise<unknown>);
    expect(stance).toEqual(missing);
  });

  it("get_file_detail returns the missing-file answer for a stance PDF", async () => {
    table = [stanceRow()];
    expect(await tools.get_file_detail({ file_id: STANCE_ID }, ORG)).toEqual({
      message: "File not found.",
      file_id: STANCE_ID,
    });
  });

  it.each(["agent_attach_file_to_entity", "agent_detach_file_from_entity"])(
    "%s leaves a stance PDF untouched and answers as for a missing file",
    async (toolName) => {
      const execute = writeToolExecutors.get(toolName)!;
      const params = { file_id: STANCE_ID, entity_type: "project", entity_id: 9 };
      table = [stanceRow()];
      const row = table[0];
      const stance = await execute(params, ORG);
      expect(row.updated).toBeUndefined();
      expect(row.source).toBe("Bias audit stance report");
      table = [];
      expect(stance).toEqual(await execute(params, ORG));
    },
  );

  it.each(["Bias audit stance report", "File Manager", "anything"])(
    "agent_attach_file_to_entity refuses entity_type %s and writes nothing",
    async (entityType) => {
      const execute = writeToolExecutors.get("agent_attach_file_to_entity")!;
      table = [visibleRow()];
      await expect(
        execute({ file_id: 1, entity_type: entityType, entity_id: 9 }, ORG),
      ).rejects.toThrow(/Unsupported entity_type/);
      expect(table[0].updated).toBeUndefined();
      expect(table[0].source).toBe("File Manager");
    },
  );

  it("agent_attach_file_to_entity still attaches with an allowed entity_type", async () => {
    const execute = writeToolExecutors.get("agent_attach_file_to_entity")!;
    table = [visibleRow()];
    await execute({ file_id: 1, entity_type: "project", entity_id: 9 }, ORG);
    expect(table[0].updated).toBe(1);
  });

  it("agent_assign_file_to_folder refuses a stance PDF as it refuses a missing file", async () => {
    const execute = writeToolExecutors.get("agent_assign_file_to_folder")!;
    const { stance, missing } = await stanceAndMissing(() =>
      execute({ file_id: STANCE_ID, folder_id: 3 }, ORG),
    );
    expect(stance).toEqual(missing);
    expect(stance).toEqual({ thrown: `File #${STANCE_ID} not found.` });
    expect(mockAssign).not.toHaveBeenCalled();
  });
});
