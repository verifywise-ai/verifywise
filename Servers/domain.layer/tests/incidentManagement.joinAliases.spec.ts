import { Sequelize } from "sequelize-typescript";
import { AIIncidentManagementModel } from "../models/incidentManagement/incidemtManagement.model";

/**
 * Regression coverage for the joined display-name aliases (issue #4583).
 *
 * The list/detail queries use raw SQL with LEFT JOIN aliases
 * (model_inventory_name / project_title / assignee_name) and rely on
 * `mapToModel` to carry those aliased columns onto the returned model
 * instances. Sequelize only maps columns that are declared model
 * attributes — plain `declare`d fields are dropped, which surfaced as
 * null names in the API (empty table cells and empty filter dropdowns).
 * These tests pin the aliases as VIRTUAL attributes.
 */

const testSequelize = new Sequelize({
  dialect: "postgres",
  database: "verifywise_test",
  username: "postgres",
  password: "postgres",
  host: "localhost",
  port: 5432,
  logging: false,
});
testSequelize.addModels([AIIncidentManagementModel]);

describe("AIIncidentManagementModel — joined display-name aliases (issue #4583)", () => {
  it("declares the aliases as model attributes so raw-query mapToModel keeps them", () => {
    expect(Object.keys(AIIncidentManagementModel.rawAttributes)).toEqual(
      expect.arrayContaining(["model_inventory_name", "project_title", "assignee_name"]),
    );
  });

  it("maps the aliased SQL columns onto field names mapToModel can resolve", () => {
    const fields = Object.values(AIIncidentManagementModel.rawAttributes).map((a) => a.field);
    expect(fields).toEqual(
      expect.arrayContaining(["model_inventory_name", "project_title", "assignee_name"]),
    );
  });

  it("builds an instance from a raw query row with the aliases populated", () => {
    const incident = AIIncidentManagementModel.build({
      id: 1,
      ai_project: "Recruitment Screening Platform",
      model_inventory_id: 1,
      model_inventory_name: "TalentAI Candidate Ranking Model v2.3",
      project_title: "AI Recruitment Screening Platform",
      assignee_name: "Mohammad Khalilzadeh",
    } as any);
    expect(incident.getDataValue("model_inventory_name")).toBe(
      "TalentAI Candidate Ranking Model v2.3",
    );
    expect(incident.getDataValue("project_title")).toBe("AI Recruitment Screening Platform");
    expect(incident.getDataValue("assignee_name")).toBe("Mohammad Khalilzadeh");
    expect(incident.toSafeJSON().assignee_name).toBe("Mohammad Khalilzadeh");
  });
});
