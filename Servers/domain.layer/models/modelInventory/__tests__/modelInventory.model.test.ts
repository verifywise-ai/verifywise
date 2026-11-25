import { describe, it, expect } from "@jest/globals";
import "../../../../database/db";
import { ModelInventoryModel } from "../modelInventory.model";

const base = { provider: "Acme", model: "M", version: "1" };

describe("ModelInventoryModel write helpers", () => {
  it("clears the external key when null is sent on update (was a TypeError)", () => {
    const row = ModelInventoryModel.createNewModelInventory({ ...base, external_key: "k-1" });
    const updated = ModelInventoryModel.updateModelInventory(row, { external_key: null } as any);
    expect(updated.external_key ?? null).toBeNull();
  });

  it("stores an empty type as unclassified (null) on create and update", () => {
    const row = ModelInventoryModel.createNewModelInventory({ ...base, type: "" } as any);
    expect(row.type ?? null).toBeNull();
    const withType = ModelInventoryModel.createNewModelInventory({ ...base, type: "RAG" } as any);
    const updated = ModelInventoryModel.updateModelInventory(withType, { type: "" } as any);
    expect(updated.type ?? null).toBeNull();
  });
});
