/**
 * A bias audit stance PDF must survive every delete path, not only the file
 * manager. These cover the paths that delete files rows directly or used to.
 */
const mockQuery = jest.fn();
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

import { BIAS_AUDIT_STANCE_SOURCE } from "../fileUpload.utils";
import { deleteReportByIdQuery, REPORT_FILE_SOURCES } from "../reporting.utils";
import { deleteItem, detachFile } from "../../extensions/model-lifecycle/modelLifecycle.service";

const deletesFromFiles = () =>
  mockQuery.mock.calls.filter(([sql]) => /\bDELETE\s+FROM\s+files\b/.test(sql));

beforeEach(() => mockQuery.mockReset());

describe("report delete", () => {
  it("deletes only report sources, and the stance source is not one", async () => {
    mockQuery.mockResolvedValue([]);
    await expect(deleteReportByIdQuery(77, 5)).resolves.toBe(false);
    const deletes = deletesFromFiles();
    expect(deletes).toHaveLength(1);
    const [sql, opts] = deletes[0];
    expect(sql).toMatch(/\bsource IN \(:sources\)/);
    expect(opts.replacements.sources).not.toContain(BIAS_AUDIT_STANCE_SOURCE);
    expect(REPORT_FILE_SOURCES).not.toContain(BIAS_AUDIT_STANCE_SOURCE);
  });

  it("still deletes a report", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 77 }]);
    await expect(deleteReportByIdQuery(77, 5)).resolves.toBe(true);
  });
});

describe("model lifecycle", () => {
  it("detach only unlinks and never deletes a files row", async () => {
    mockQuery.mockResolvedValue([]);
    await detachFile(5, 3, 4, 77);
    expect(deletesFromFiles()).toHaveLength(0);
  });

  it("deleting an item never deletes its attached files", async () => {
    mockQuery.mockResolvedValueOnce([{ file_id: 77 }]).mockResolvedValue([]);
    await deleteItem(5, 4);
    expect(deletesFromFiles()).toHaveLength(0);
  });
});
