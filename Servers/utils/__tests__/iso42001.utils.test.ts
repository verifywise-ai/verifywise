import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: {
    query: jest.fn<any>(),
  },
}));

jest.mock("../fileUpload.utils", () => ({
  uploadFile: jest.fn<any>(),
}));

import {
  getCurrentSubClauseForSaveQuery,
  getCurrentAnnexCategoryForSaveQuery,
  uploadIso42001Files,
  aggregateClausesProgressAcrossProjects,
  aggregateAnnexesProgressAcrossProjects,
  countSubClausesISOByProjectId,
  countAnnexCategoriesISOByProjectId,
} from "../iso42001.utils";
import { sequelize } from "../../database/db";
import { uploadFile } from "../fileUpload.utils";

const mockQuery = sequelize.query as jest.MockedFunction<typeof sequelize.query>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;

const fakeTransaction = { id: "tx1" } as any;

describe("getCurrentSubClauseForSaveQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the first row when one exists", async () => {
    const row = {
      project_id: 7,
      owner: 1,
      reviewer: 2,
      approver: 3,
      title: "4.1 Understanding the org",
    };
    mockQuery.mockResolvedValueOnce([row] as any);

    const result = await getCurrentSubClauseForSaveQuery(42, 99, fakeTransaction);

    expect(result).toEqual(row);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM subclauses_iso sc"),
      expect.objectContaining({
        replacements: { organizationId: 99, id: 42 },
        transaction: fakeTransaction,
      }),
    );
  });

  it("returns null when no rows are found", async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    const result = await getCurrentSubClauseForSaveQuery(42, 99, fakeTransaction);
    expect(result).toBeNull();
  });
});

describe("getCurrentAnnexCategoryForSaveQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the first row when one exists", async () => {
    const row = {
      project_id: 12,
      owner: null,
      reviewer: 5,
      approver: 9,
      title: "A.5.1 Policies for AI",
    };
    mockQuery.mockResolvedValueOnce([row] as any);

    const result = await getCurrentAnnexCategoryForSaveQuery(7, 99, fakeTransaction);

    expect(result).toEqual(row);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM annexcategories_iso ac"),
      expect.objectContaining({
        replacements: { organizationId: 99, id: 7 },
        transaction: fakeTransaction,
      }),
    );
  });

  it("returns null when no rows are found", async () => {
    mockQuery.mockResolvedValueOnce([] as any);
    const result = await getCurrentAnnexCategoryForSaveQuery(7, 99, fakeTransaction);
    expect(result).toBeNull();
  });
});

describe("uploadIso42001Files", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseFile = {
    id: 11,
    filename: "evidence.pdf",
    project_id: 4,
    uploaded_by: 1,
    uploaded_time: new Date("2026-01-01"),
    type: "application/pdf",
    source: "Management system clauses group",
  } as any;

  it("uploads each file and returns FileType records", async () => {
    mockUploadFile.mockResolvedValueOnce(baseFile);
    mockUploadFile.mockResolvedValueOnce({ ...baseFile, id: 12, filename: "audit.pdf" });

    const result = await uploadIso42001Files(
      [{ name: "a" } as any, { name: "b" } as any],
      1,
      4,
      "Management system clauses group",
      99,
      fakeTransaction,
    );

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("11");
    expect(result[1].fileName).toBe("audit.pdf");
    expect(mockUploadFile).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when no files passed", async () => {
    const result = await uploadIso42001Files(
      [],
      1,
      4,
      "Reference controls group",
      99,
      fakeTransaction,
    );
    expect(result).toEqual([]);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });
});

describe("aggregateClausesProgressAcrossProjects", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const buildProject = (projectFrameworkId: number | undefined) => ({
    dataValues: {
      framework: projectFrameworkId
        ? [{ framework_id: 2, project_framework_id: projectFrameworkId }]
        : [{ framework_id: 99, project_framework_id: 1 }],
    },
  });

  it("sums totals across ISO 42001 frameworks only", async () => {
    mockQuery.mockResolvedValueOnce([[{ totalSubclauses: "10", doneSubclauses: "3" }], 0] as any);
    mockQuery.mockResolvedValueOnce([[{ totalSubclauses: "5", doneSubclauses: "1" }], 0] as any);

    const result = await aggregateClausesProgressAcrossProjects(
      [buildProject(10), buildProject(20)] as any,
      99,
    );

    expect(result).toEqual({ allSubclauses: 15, allDoneSubclauses: 4 });
  });

  it("skips projects without an ISO 42001 framework", async () => {
    const result = await aggregateClausesProgressAcrossProjects(
      [buildProject(undefined)] as any,
      99,
    );
    expect(result).toEqual({ allSubclauses: 0, allDoneSubclauses: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("aggregateAnnexesProgressAcrossProjects", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const buildProject = (projectFrameworkId: number | undefined) => ({
    dataValues: {
      framework: projectFrameworkId
        ? [{ framework_id: 2, project_framework_id: projectFrameworkId }]
        : [{ framework_id: 99, project_framework_id: 1 }],
    },
  });

  it("sums totals across ISO 42001 frameworks only", async () => {
    mockQuery.mockResolvedValueOnce([
      [{ totalAnnexcategories: "8", doneAnnexcategories: "2" }],
      0,
    ] as any);
    mockQuery.mockResolvedValueOnce([
      [{ totalAnnexcategories: "4", doneAnnexcategories: "1" }],
      0,
    ] as any);

    const result = await aggregateAnnexesProgressAcrossProjects(
      [buildProject(11), buildProject(22)] as any,
      99,
    );

    expect(result).toEqual({ allAnnexcategories: 12, allDoneAnnexcategories: 3 });
  });

  it("skips projects without an ISO 42001 framework", async () => {
    const result = await aggregateAnnexesProgressAcrossProjects(
      [buildProject(undefined)] as any,
      99,
    );
    expect(result).toEqual({ allAnnexcategories: 0, allDoneAnnexcategories: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("countSubClausesISOByProjectId / countAnnexCategoriesISOByProjectId helpers (smoke)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("countSubClausesISOByProjectId returns the row values", async () => {
    mockQuery.mockResolvedValueOnce([
      [{ totalSubclauses: "3", doneSubclauses: "1" }],
      0,
    ] as any);
    const result = await countSubClausesISOByProjectId(1, 99);
    expect(result.totalSubclauses).toBe("3");
    expect(result.doneSubclauses).toBe("1");
  });

  it("countAnnexCategoriesISOByProjectId returns the row values", async () => {
    mockQuery.mockResolvedValueOnce([
      [{ totalAnnexcategories: "4", doneAnnexcategories: "2" }],
      0,
    ] as any);
    const result = await countAnnexCategoriesISOByProjectId(1, 99);
    expect(result.totalAnnexcategories).toBe("4");
    expect(result.doneAnnexcategories).toBe("2");
  });
});
