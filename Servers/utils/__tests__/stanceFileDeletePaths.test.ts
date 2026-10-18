/**
 * A bias audit stance PDF must survive every delete path, not only the file
 * manager. These cover the paths that delete files rows directly.
 */
const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { everyFilesReferenceFiltered } from "../files/__tests__/helpers/fakeFilesTable";
import { BIAS_AUDIT_STANCE_SOURCE } from "../fileUpload.utils";
import { deleteReportByIdQuery } from "../reporting.utils";
import { deleteItem, detachFile } from "../../extensions/model-lifecycle/modelLifecycle.service";

const tx = {} as any;

beforeEach(() => mockQuery.mockReset());

describe("report delete", () => {
  it("answers a stance PDF id as a missing id: false, and deletes only visible files", async () => {
    mockQuery.mockResolvedValue([]);
    await expect(deleteReportByIdQuery(77, 5, tx)).resolves.toBe(false);
    const deletes = mockQuery.mock.calls.filter(([sql]) => /^\s*DELETE\b/.test(sql));
    expect(deletes).toHaveLength(1);
    for (const [sql, opts] of deletes) {
      expect(sql).toMatch(/\bFROM\s+files\b/);
      expect(everyFilesReferenceFiltered(sql)).toBe(true);
      expect(opts.replacements.stanceSource).toBe(BIAS_AUDIT_STANCE_SOURCE);
      expect(opts.transaction).toBe(tx);
    }
  });

  it("still deletes a report", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 77 }]);
    await expect(deleteReportByIdQuery(77, 5, tx)).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][0]).toContain("DELETE FROM files");
  });
});

describe("model lifecycle detach", () => {
  it("unlinks the file but never deletes a stance PDF", async () => {
    mockQuery.mockResolvedValue([]);
    await detachFile(5, 3, 4, 77);
    const [sql, opts] = mockQuery.mock.calls[1];
    expect(sql).toContain("DELETE FROM files");
    expect(sql).toContain("source IS DISTINCT FROM :stanceSource");
    expect(opts.replacements.stanceSource).toBe(BIAS_AUDIT_STANCE_SOURCE);
  });

  it("never deletes a stance PDF when an item and its attached files are removed", async () => {
    mockQuery.mockResolvedValueOnce([{ file_id: 77 }]).mockResolvedValue([]);
    await deleteItem(5, 4);
    const [sql, opts] = mockQuery.mock.calls[1];
    expect(sql).toContain("DELETE FROM files");
    expect(sql).toContain("source IS DISTINCT FROM :stanceSource");
    expect(opts.replacements).toMatchObject({
      fileIds: [77],
      stanceSource: BIAS_AUDIT_STANCE_SOURCE,
    });
  });
});
