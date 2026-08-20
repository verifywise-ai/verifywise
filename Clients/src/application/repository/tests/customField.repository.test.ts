import {
  listCustomFieldDefinitions,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition,
  getCustomFieldValuesForEntity,
  setCustomFieldValue,
  deleteCustomFieldValue,
  getMissingRequiredCustomFields,
} from "../customField.repository";
import { apiServices } from "../../../infrastructure/api/networkServices";

vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("customField.repository", () => {
  describe("listCustomFieldDefinitions", () => {
    it("makes a get request scoped to the entity type", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: [{ id: 1 }] },
      });
      const signal = new AbortController().signal;

      const result = await listCustomFieldDefinitions({ entityType: "vendor", signal } as any);

      expect(apiServices.get).toHaveBeenCalledWith("/custom-fields/definitions/vendor", { signal });
      expect(result).toEqual([{ id: 1 }]);
    });

    it("returns an empty array when data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: undefined,
      });

      const result = await listCustomFieldDefinitions({ entityType: "vendor" } as any);

      expect(result).toEqual([]);
    });
  });

  describe("createCustomFieldDefinition", () => {
    it("makes a post request with the definition payload", async () => {
      const body = { label: "Custom", entity_type: "vendor" } as any;
      vi.mocked(apiServices.post).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: { id: 1, ...body } },
      });

      const result = await createCustomFieldDefinition(body);

      expect(apiServices.post).toHaveBeenCalledWith("/custom-fields/definitions", body);
      expect(result).toEqual({ id: 1, ...body });
    });
  });

  describe("updateCustomFieldDefinition", () => {
    it("makes a patch request scoped to the definition id", async () => {
      const body = { label: "Updated" } as any;
      vi.mocked(apiServices.patch).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: { id: 2, ...body } },
      });

      const result = await updateCustomFieldDefinition({ id: 2, body });

      expect(apiServices.patch).toHaveBeenCalledWith("/custom-fields/definitions/2", body);
      expect(result).toEqual({ id: 2, ...body });
    });
  });

  describe("deleteCustomFieldDefinition", () => {
    it("makes a delete request scoped to the definition id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: undefined,
      });

      await deleteCustomFieldDefinition(3);

      expect(apiServices.delete).toHaveBeenCalledWith("/custom-fields/definitions/3");
    });
  });

  describe("getCustomFieldValuesForEntity", () => {
    it("makes a get request scoped to entity type and id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: [{ id: 1, value: "x" }] },
      });
      const signal = new AbortController().signal;

      const result = await getCustomFieldValuesForEntity({
        entityType: "vendor",
        entityId: 5,
        signal,
      } as any);

      expect(apiServices.get).toHaveBeenCalledWith("/custom-fields/values/vendor/5", { signal });
      expect(result).toEqual([{ id: 1, value: "x" }]);
    });

    it("returns an empty array when data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: undefined,
      });

      const result = await getCustomFieldValuesForEntity({
        entityType: "vendor",
        entityId: 5,
      } as any);

      expect(result).toEqual([]);
    });
  });

  describe("setCustomFieldValue", () => {
    it("makes a put request with the value payload", async () => {
      const body = { definition_id: 1, entity_id: 5, value: "x" };
      vi.mocked(apiServices.put).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: undefined,
      });

      await setCustomFieldValue(body);

      expect(apiServices.put).toHaveBeenCalledWith("/custom-fields/values", body);
    });
  });

  describe("deleteCustomFieldValue", () => {
    it("makes a delete request scoped to definition and entity id", async () => {
      vi.mocked(apiServices.delete).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: undefined,
      });

      await deleteCustomFieldValue({ definitionId: 1, entityId: 5 });

      expect(apiServices.delete).toHaveBeenCalledWith("/custom-fields/values/1/5");
    });
  });

  describe("getMissingRequiredCustomFields", () => {
    it("makes a get request scoped to entity type and id", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: { data: [{ id: 1, field_key: "x", label: "X" }] },
      });

      const result = await getMissingRequiredCustomFields({
        entityType: "vendor",
        entityId: 5,
      } as any);

      expect(apiServices.get).toHaveBeenCalledWith(
        "/custom-fields/values/vendor/5/missing-required",
        { signal: undefined },
      );
      expect(result).toEqual([{ id: 1, field_key: "x", label: "X" }]);
    });

    it("returns an empty array when data is absent", async () => {
      vi.mocked(apiServices.get).mockResolvedValue({
        status: 200,
        statusText: "OK",
        data: undefined,
      });

      const result = await getMissingRequiredCustomFields({
        entityType: "vendor",
        entityId: 5,
      } as any);

      expect(result).toEqual([]);
    });
  });
});
