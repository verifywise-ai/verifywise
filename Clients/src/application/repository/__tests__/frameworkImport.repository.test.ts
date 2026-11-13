const mockPost = vi.fn();
vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: { post: (...args: unknown[]) => mockPost(...args) },
}));

import { importFramework } from "../frameworkImport.repository";

const rows = [{ framework_name: "Policy", topic_number: "1", topic_name: "Governance" }];

describe("frameworkImport.repository importFramework", () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it("posts the rows to the v1 endpoint and returns the result", async () => {
    const result = { success: true, imported_topics: 1, imported_subtopics: 0, errors: [] };
    mockPost.mockResolvedValue({ data: { message: "OK", data: result } });
    await expect(importFramework(rows)).resolves.toEqual(result);
    expect(mockPost).toHaveBeenCalledWith("/v1/framework-import/import", { csvData: rows });
  });

  it("returns the per-row result carried by a 400 instead of throwing", async () => {
    const result = {
      success: false,
      imported_topics: 0,
      imported_subtopics: 0,
      failed: 1,
      errors: [{ row: 2, field: "topic_name", message: "Topic name is required" }],
    };
    mockPost.mockImplementation(async () => {
      throw Object.assign(new Error("Bad Request"), {
        status: 400,
        response: { message: "Bad Request", data: result },
      });
    });
    await expect(importFramework(rows)).resolves.toEqual(result);
  });

  it("rethrows other failures", async () => {
    const err = Object.assign(new Error("Access denied"), { status: 403, response: {} });
    mockPost.mockImplementation(async () => {
      throw err;
    });
    await expect(importFramework(rows)).rejects.toBe(err);
  });
});
