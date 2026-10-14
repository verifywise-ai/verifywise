import { describe, it, expect } from "@jest/globals";
import { ProjectModel } from "../project.model";

describe("ProjectModel.toJSON", () => {
  it("includes custom field values attached by list queries", () => {
    const customFields = [
      {
        definition_id: 2,
        field_key: "feasibility",
        label: "Feasibility",
        field_type: "scored_select",
        value: "opt_h",
      },
    ];
    const json = ProjectModel.prototype.toJSON.call({
      id: 7,
      dataValues: { custom_fields: customFields },
    } as unknown as ProjectModel);
    expect(json.custom_fields).toEqual(customFields);
  });
});
