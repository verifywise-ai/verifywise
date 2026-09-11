import {
  validateAssigneeId,
  validateCompleteIncidentCreation,
  validateCompleteIncidentUpdate,
  validateModelInventoryId,
  validateProjectId,
} from "./incidentManagementValidation.utils";

describe("incident reference FK validation — issue #4583", () => {
  describe("validateModelInventoryId / validateProjectId / validateAssigneeId", () => {
    it.each([
      ["validateModelInventoryId", validateModelInventoryId],
      ["validateProjectId", validateProjectId],
      ["validateAssigneeId", validateAssigneeId],
    ])("%s accepts absent values (no link)", (_name, validator) => {
      expect(validator(undefined).isValid).toBe(true);
      expect(validator(null).isValid).toBe(true);
      expect(validator("").isValid).toBe(true);
    });

    it.each([
      ["validateModelInventoryId", validateModelInventoryId],
      ["validateProjectId", validateProjectId],
      ["validateAssigneeId", validateAssigneeId],
    ])("%s accepts positive integer ids including numeric strings", (_name, validator) => {
      expect(validator(5).isValid).toBe(true);
      expect(validator("12").isValid).toBe(true);
    });

    it.each([
      ["validateModelInventoryId", validateModelInventoryId],
      ["validateProjectId", validateProjectId],
      ["validateAssigneeId", validateAssigneeId],
    ])("%s rejects 0, negatives, non-integers and non-numeric values", (_name, validator) => {
      expect(validator(0).isValid).toBe(false);
      expect(validator(-3).isValid).toBe(false);
      expect(validator(1.5).isValid).toBe(false);
      expect(validator("abc").isValid).toBe(false);
    });
  });

  describe("complete create/update validation", () => {
    it("passes when no FK fields are present (legacy payloads)", () => {
      expect(validateCompleteIncidentCreation({ description: "x" })).toEqual([]);
      expect(validateCompleteIncidentUpdate({ description: "x" })).toEqual([]);
    });

    it("passes when all FK fields are valid", () => {
      const errors = validateCompleteIncidentCreation({
        model_inventory_id: 1,
        project_id: 2,
        assignee_id: 3,
      });
      expect(errors).toEqual([]);
    });

    it("flags every invalid FK field on create", () => {
      const errors = validateCompleteIncidentCreation({
        model_inventory_id: 0,
        project_id: "nope",
        assignee_id: -1,
      });
      expect(errors.map((e) => e.field).sort()).toEqual(
        ["assignee_id", "model_inventory_id", "project_id"].sort(),
      );
      expect(errors.every((e) => e.code === "INVALID_ID")).toBe(true);
    });

    it("flags invalid FK fields on update", () => {
      const errors = validateCompleteIncidentUpdate({ assignee_id: 2.5 });
      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe("assignee_id");
    });
  });
});
