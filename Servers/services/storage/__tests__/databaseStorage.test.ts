import { describe, expect, it } from "@jest/globals";
import { DatabaseStorage } from "../databaseStorage";
import { StorageUnsupportedError } from "../types";

describe("DatabaseStorage", () => {
  const storage = new DatabaseStorage();

  it("reports the local provider", () => {
    expect(storage.provider).toBe("local");
  });

  it("put is a pass-through returning a keyless ref, leaving bytes for the row", async () => {
    const ref = await storage.put({
      key: "files/org-1/abc-report.pdf",
      body: Buffer.from("data"),
      contentType: "application/pdf",
    });

    expect(ref).toEqual({ provider: "local", key: null });
  });

  it("delete is a no-op because bytes die with the files row", async () => {
    await expect(storage.delete("any-key")).resolves.toBeUndefined();
  });

  it("get is unsupported: local bytes are read from files.content", async () => {
    await expect(storage.get("any-key")).rejects.toBeInstanceOf(StorageUnsupportedError);
  });

  it("signUrl is unsupported for the local provider", async () => {
    await expect(storage.signUrl("any-key")).rejects.toBeInstanceOf(StorageUnsupportedError);
  });
});
