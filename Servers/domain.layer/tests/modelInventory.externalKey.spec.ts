import { ModelInventoryModel } from "../models/modelInventory/modelInventory.model";

// Mock sequelize-typescript so the real model class can load without a DB.
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    TEXT: "TEXT",
    ENUM: jest.fn(),
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) {
        Object.assign(this, data);
      }
    }
  },
}));

describe("ModelInventoryModel external_key normalization (issue #4755)", () => {
  describe("createNewModelInventory", () => {
    it("stores an empty external_key as undefined (NULL) to skip the unique index", () => {
      const model = ModelInventoryModel.createNewModelInventory({
        provider: "OpenAI",
        model: "GPT",
        version: "1",
        external_key: "",
      });
      expect(model.external_key).toBeUndefined();
    });

    it("stores a whitespace-only external_key as undefined (NULL)", () => {
      const model = ModelInventoryModel.createNewModelInventory({
        provider: "OpenAI",
        model: "GPT",
        version: "1",
        external_key: "   ",
      });
      expect(model.external_key).toBeUndefined();
    });

    it("trims surrounding whitespace from a real external_key", () => {
      const model = ModelInventoryModel.createNewModelInventory({
        provider: "OpenAI",
        model: "GPT",
        version: "1",
        external_key: "  credit-scoring-v3  ",
      });
      expect(model.external_key).toBe("credit-scoring-v3");
    });

    it("keeps a normal external_key untouched", () => {
      const model = ModelInventoryModel.createNewModelInventory({
        provider: "OpenAI",
        model: "GPT",
        version: "1",
        external_key: "key-1",
      });
      expect(model.external_key).toBe("key-1");
    });
  });

  describe("updateModelInventory", () => {
    const existing = () =>
      ModelInventoryModel.createNewModelInventory({
        provider: "OpenAI",
        model: "GPT",
        version: "1",
        external_key: "key-1",
      });

    it("clears the external_key when the update value is blank", () => {
      const model = ModelInventoryModel.updateModelInventory(existing(), {
        external_key: "   ",
      } as any);
      expect(model.external_key).toBeUndefined();
    });

    it("trims the external_key on update", () => {
      const model = ModelInventoryModel.updateModelInventory(existing(), {
        external_key: "  key-2  ",
      } as any);
      expect(model.external_key).toBe("key-2");
    });

    it("leaves the external_key unchanged when the field is not provided", () => {
      const model = ModelInventoryModel.updateModelInventory(existing(), {
        model: "GPT-2",
      } as any);
      expect(model.external_key).toBe("key-1");
    });
  });
});
