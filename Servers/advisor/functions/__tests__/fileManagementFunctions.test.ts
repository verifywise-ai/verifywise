/**
 * A bias audit stance PDF is served only by the stance endpoint. The advisor's
 * file tools must treat it as a missing file: no listing it, no moving it, and
 * no writing the stance source onto another file.
 */
const mockQuery = jest.fn();
const mockGetFileById = jest.fn();
const mockGetFileMetadata = jest.fn();
const mockAssignToFolder = jest.fn();
const mockGetFolder = jest.fn();
const mockAllVisible = jest.fn();

jest.mock("../../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/fileUpload.utils", () => ({
  getFileById: (...args: any[]) => mockGetFileById(...args),
  getFileMetadataByProjectId: (...args: any[]) => mockGetFileMetadata(...args),
}));
jest.mock("../../../utils/virtualFolder.utils", () => ({
  createFolderQuery: jest.fn(),
  assignFilesToFolderQuery: (...args: any[]) => mockAssignToFolder(...args),
  getFolderByIdQuery: (...args: any[]) => mockGetFolder(...args),
  removeFileFromFolderQuery: jest.fn(),
}));
jest.mock("../../../utils/files/visibleFiles", () => ({
  ...jest.requireActual("../../../utils/files/visibleFiles"),
  allFilesVisibleQuery: (...args: any[]) => mockAllVisible(...args),
}));

import { availableFileManagementTools as tools } from "../fileManagementFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { BIAS_AUDIT_STANCE_SOURCE } from "../../../utils/files/visibleFiles";

const ORG = 42;
const execute = (name: string, params: Record<string, unknown>) =>
  writeToolExecutors.get(name)!(params, ORG);

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue([[], 0]);
  mockGetFileById.mockReset();
  mockGetFileMetadata.mockReset();
  mockAssignToFolder.mockReset().mockResolvedValue(1);
  mockGetFolder.mockReset().mockResolvedValue({ id: 2 });
  mockAllVisible.mockReset().mockResolvedValue(true);
});

const sqlOf = (call: number) => mockQuery.mock.calls[call][0] as string;
const replacementsOf = (call: number) => mockQuery.mock.calls[call][1].replacements;

describe("advisor file reads", () => {
  it("hides stance PDFs from the org-wide listing", async () => {
    await tools.fetch_files({}, ORG);
    expect(sqlOf(0)).toContain("source IS DISTINCT FROM :stanceSource");
    expect(replacementsOf(0).stanceSource).toBe(BIAS_AUDIT_STANCE_SOURCE);
  });

  it("hides stance PDFs from a listing filtered by source", async () => {
    await tools.fetch_files({ entity_type: BIAS_AUDIT_STANCE_SOURCE }, ORG);
    const last = mockQuery.mock.calls.length - 1;
    expect(sqlOf(last)).toContain("source IS DISTINCT FROM :stanceSource");
  });

  it("hides stance PDFs from entity listings", async () => {
    await tools.get_files_by_entity({ entity_type: "project", entity_id: 1 }, ORG);
    expect(sqlOf(0)).toContain("source IS DISTINCT FROM :stanceSource");
  });

  it.each(["get_file_detail", "get_file_change_history"])(
    "%s answers for a stance PDF as for a missing file",
    async (tool) => {
      mockGetFileById.mockResolvedValue({ id: 7, source: BIAS_AUDIT_STANCE_SOURCE });
      await expect(tools[tool]({ file_id: 7 }, ORG)).resolves.toEqual({
        message: "File not found.",
        file_id: 7,
      });
      expect(mockQuery).not.toHaveBeenCalled();
    },
  );

  it("still returns detail for an ordinary file", async () => {
    mockGetFileById.mockResolvedValue({ id: 7, source: "File manager", filename: "a.pdf" });
    await expect(tools.get_file_detail({ file_id: 7 }, ORG)).resolves.toMatchObject({
      id: 7,
      filename: "a.pdf",
    });
  });

  it("leaves stance PDFs out of file analytics and the summary", async () => {
    mockQuery
      .mockResolvedValueOnce([[{}], 0])
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([[{}], 0]);
    await tools.get_file_analytics({}, ORG);
    expect(mockQuery.mock.calls).toHaveLength(5);
    for (const call of mockQuery.mock.calls) {
      expect(call[0]).toContain("source IS DISTINCT FROM :stanceSource");
      expect(call[1].replacements.stanceSource).toBe(BIAS_AUDIT_STANCE_SOURCE);
    }

    mockQuery.mockReset().mockResolvedValue([[{}], 0]);
    await tools.get_file_executive_summary({}, ORG);
    for (const call of mockQuery.mock.calls) {
      expect(call[0]).toContain("source IS DISTINCT FROM :stanceSource");
    }
  });
});

describe("advisor file writes", () => {
  const attach = { file_id: 7, entity_type: "project", entity_id: 3 };
  const detach = attach;
  const folder = { file_id: 7, folder_id: 2 };

  it.each([
    ["agent_attach_file_to_entity", attach],
    ["agent_detach_file_from_entity", detach],
  ])("%s refuses a stance PDF and changes nothing", async (tool, params) => {
    mockAllVisible.mockResolvedValue(false);
    await expect(execute(tool, params)).rejects.toThrow("File not found.");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("refuses writing the stance source onto a file", async () => {
    await expect(
      execute("agent_attach_file_to_entity", {
        ...attach,
        entity_type: BIAS_AUDIT_STANCE_SOURCE,
      }),
    ).rejects.toThrow(/reserved/);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockAllVisible).not.toHaveBeenCalled();
  });

  it("guards the attach update itself against a stance row", async () => {
    await execute("agent_attach_file_to_entity", attach);
    expect(sqlOf(0)).toContain("source IS DISTINCT FROM :stanceSource");
  });

  it("refuses assigning a stance PDF to a folder", async () => {
    mockAllVisible.mockResolvedValue(false);
    await expect(execute("agent_assign_file_to_folder", folder)).rejects.toThrow("File not found.");
    expect(mockAssignToFolder).not.toHaveBeenCalled();
  });

  it("refuses a missing or foreign folder with a clean message", async () => {
    mockGetFolder.mockResolvedValue(null);
    await expect(execute("agent_assign_file_to_folder", folder)).rejects.toThrow(
      "Folder not found.",
    );
    expect(mockGetFolder).toHaveBeenCalledWith(ORG, 2);
    expect(mockAssignToFolder).not.toHaveBeenCalled();
  });

  it.each([[0], [-1], ["abc"], [undefined]])("refuses folder id %j", async (folderId) => {
    await expect(
      execute("agent_assign_file_to_folder", { file_id: 7, folder_id: folderId }),
    ).rejects.toThrow("Folder not found.");
    expect(mockGetFolder).not.toHaveBeenCalled();
    expect(mockAssignToFolder).not.toHaveBeenCalled();
  });

  it("still assigns an ordinary file to a folder", async () => {
    await expect(execute("agent_assign_file_to_folder", folder)).resolves.toMatchObject({
      assigned: true,
    });
    expect(mockAssignToFolder).toHaveBeenCalled();
  });
});
