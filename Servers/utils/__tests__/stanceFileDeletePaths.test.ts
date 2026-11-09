/**
 * A bias audit stance PDF must survive every delete path, not only the file
 * manager. These cover the paths that delete files rows directly.
 */
const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { BIAS_AUDIT_STANCE_SOURCE } from "../fileUpload.utils";
import { REPORT_FILE_SOURCES, deleteReportByIdQuery } from "../reporting.utils";
import { deleteItem, detachFile } from "../../extensions/model-lifecycle/modelLifecycle.service";

beforeEach(() => mockQuery.mockReset());

describe("report delete", () => {
  it("cannot reach a stance PDF: the delete is scoped to report sources", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await expect(deleteReportByIdQuery(77, 5)).resolves.toBe(false);
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toContain("source IN (:sources)");
    expect(opts.replacements.sources).not.toContain(BIAS_AUDIT_STANCE_SOURCE);
    expect(REPORT_FILE_SOURCES).not.toContain(BIAS_AUDIT_STANCE_SOURCE);
  });

  it("still deletes a report", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 77 }]);
    await expect(deleteReportByIdQuery(77, 5)).resolves.toBe(true);
    expect(mockQuery.mock.calls[0][0]).toContain("DELETE FROM files");
  });
});

describe("model lifecycle detach", () => {
  it("unlinks the file and never deletes a files row", async () => {
    mockQuery.mockResolvedValue([]);
    await detachFile(5, 3, 4, 77);
    const sql = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sql[0]).toContain("DELETE FROM model_lifecycle_item_files");
    expect(sql.some((s) => s.includes("DELETE FROM files"))).toBe(false);
  });

  it("never deletes a files row when an item is removed", async () => {
    mockQuery.mockResolvedValue([]);
    await deleteItem(5, 4);
    const sql = mockQuery.mock.calls.map((c) => c[0] as string);
    expect(sql.some((s) => s.includes("DELETE FROM files"))).toBe(false);
  });
});
