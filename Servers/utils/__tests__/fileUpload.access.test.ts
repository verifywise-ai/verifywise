/**
 * canUserAccessFile and the SQL filter built from the same rule.
 *
 * The rule matches the File Manager download (fileManager.ctrl.ts
 * downloadFile): Admins see every file; an organization-level file
 * (project_id IS NULL) is readable by any member of the organization; a
 * project file by its uploader and the project's owner and members.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));

import { sequelize } from "../../database/db";
import { buildFileAccessFilter, canUserAccessFile } from "../fileUpload.utils";

const mockQuery = sequelize.query as jest.MockedFunction<any>;

const lastSql = () => (mockQuery.mock.calls[0][0] as string).replace(/\s+/g, " ");
const lastReplacements = () => (mockQuery.mock.calls[0][1] as any).replacements;

describe("canUserAccessFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
  });

  // An Admin of another organization was let through for any file id, so it
  // could link another organization's file.
  it("lets an Admin open any file of their own organization only", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5 }]);
    await expect(canUserAccessFile(5, 2, "Admin", 1)).resolves.toBe(true);
    const sql = lastSql();
    expect(sql).toContain("f.organization_id = :organizationId AND f.id = :fileId");
    expect(sql).not.toContain(":fileAccessUserId");
    expect(lastReplacements()).toEqual(expect.objectContaining({ fileId: 5, organizationId: 1 }));

    mockQuery.mockResolvedValueOnce([]);
    await expect(canUserAccessFile(5, 2, "Admin", 1)).resolves.toBe(false);
  });

  // Regression: files.org_id is NULL on migrated files and uploadFile leaves it
  // null, so requiring f.org_id = the caller's org denied every member an
  // organization-level file the File Manager download serves them.
  it("reads an organization-level file by project_id alone, never by files.org_id", async () => {
    await canUserAccessFile(5, 2, "Editor", 1);
    const sql = lastSql();
    expect(sql).not.toMatch(/org_id\s*=/);
    expect(sql).toContain("f.project_id IS NULL OR");
    expect(sql).toContain("f.organization_id = :organizationId");
  });

  it("allows the uploader and the project's owner and members", async () => {
    await canUserAccessFile(5, 2, "Editor", 1);
    const sql = lastSql();
    expect(sql).toContain("f.uploaded_by = :fileAccessUserId");
    expect(sql).toMatch(/projects fa_p .*fa_p\.owner = :fileAccessUserId/);
    expect(sql).toMatch(/projects_members fa_pm .*fa_pm\.user_id = :fileAccessUserId/);
    expect(lastReplacements()).toEqual(
      expect.objectContaining({ fileId: 5, organizationId: 1, fileAccessUserId: 2 }),
    );
  });

  it("answers from whether a row came back", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5 }]);
    await expect(canUserAccessFile(5, 2, "Auditor", 1)).resolves.toBe(true);
    mockQuery.mockResolvedValueOnce([]);
    await expect(canUserAccessFile(5, 2, "Auditor", 1)).resolves.toBe(false);
  });
});

describe("buildFileAccessFilter", () => {
  it("adds nothing for an Admin", () => {
    expect(buildFileAccessFilter("f", 2, "Admin")).toEqual({ clause: "", replacements: {} });
  });

  it("applies canUserAccessFile's rule to the alias for anyone else", async () => {
    const { clause, replacements } = buildFileAccessFilter("fx", 2, "Editor");
    expect(replacements).toEqual({ fileAccessUserId: 2 });
    // A LEFT JOIN that found no file must not pass as an org-level file.
    expect(clause).toMatch(/^AND fx\.id IS NOT NULL AND /);
    expect(clause).toContain("fx.project_id IS NULL");
    expect(clause).toContain("fx.uploaded_by = :fileAccessUserId");

    // Same predicate text as canUserAccessFile, so the two cannot drift.
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
    await canUserAccessFile(5, 2, "Editor", 1);
    const predicate = clause
      .replace(/^AND fx\.id IS NOT NULL AND /, "")
      .replace(/fx\./g, "f.")
      .replace(/\s+/g, " ");
    expect(lastSql()).toContain(predicate);
  });
});
