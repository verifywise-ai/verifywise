/**
 * AI Advisor model inventory file tools keep bias audit stance PDFs out.
 *
 * list_files_for_model and agent_attach_file_to_model must answer a stance
 * PDF exactly as a missing file: the same answer over a table holding only
 * a stance PDF as over an empty one.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  fakeFilesQuery,
  stanceRow,
  visibleRow,
  type FakeFileRow,
} from "../../utils/files/__tests__/helpers/fakeFilesTable";

let table: FakeFileRow[] = [];
const mockQuery = jest.fn((sql: string, options: any) => fakeFilesQuery(table)(sql, options));
jest.mock("../../database/db", () => ({
  sequelize: { query: (sql: string, options: any) => mockQuery(sql, options) },
}));

jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.mock("../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));

jest.mock("../../utils/modelInventory.utils", () => ({}));

import { availableModelInventoryTools as tools } from "./modelInventoryFunctions";
import { writeToolExecutors } from "../confirmation/createWriteTool";

const ORG = 1;

async function stanceAndMissing(run: () => Promise<unknown>) {
  table = [stanceRow({ model_id: 7 })];
  const stance = await run().catch((e: Error) => ({ thrown: e.message }));
  table = [];
  const missing = await run().catch((e: Error) => ({ thrown: e.message }));
  return { stance, missing };
}

describe("advisor model inventory file tools and bias audit stance PDFs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    table = [];
  });

  it("list_files_for_model still lists a visible file (sanity)", async () => {
    table = [visibleRow({ model_id: 7 })];
    expect(await tools.list_files_for_model({ model_id: 7 }, ORG)).toHaveLength(1);
  });

  it("list_files_for_model answers a stance PDF as a missing file", async () => {
    const { stance, missing } = await stanceAndMissing(() =>
      tools.list_files_for_model({ model_id: 7 }, ORG),
    );
    expect(stance).toEqual(missing);
  });

  it("agent_attach_file_to_model refuses a stance PDF as it refuses a missing file", async () => {
    const execute = writeToolExecutors.get("agent_attach_file_to_model")!;
    const { stance, missing } = await stanceAndMissing(() =>
      execute({ model_id: 7, file_id: 2 }, ORG),
    );
    expect(stance).toEqual(missing);
    expect(stance).toEqual({ thrown: expect.stringMatching(/File #2 not found/) });
    const linkInserts = mockQuery.mock.calls.filter(([sql]) =>
      /INSERT INTO file_entity_links/.test(sql),
    );
    expect(linkInserts).toHaveLength(0);
  });
});
