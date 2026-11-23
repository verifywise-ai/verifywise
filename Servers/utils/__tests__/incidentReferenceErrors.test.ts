import { describe, expect, it } from "@jest/globals";
import {
  incidentReferenceFieldFromError,
  toIncidentReferenceValue,
} from "../incidentManagement.utils";

/** A Sequelize ForeignKeyConstraintError as thrown for a raw query (fields stay empty). */
const fkError = (parent: Record<string, unknown>) => ({
  name: "SequelizeForeignKeyConstraintError",
  fields: null,
  parent: { code: "23503", table: "ai_incident_managements", ...parent },
});

describe("incidentReferenceFieldFromError", () => {
  it("reads the column from the constraint name, whatever language the detail is in", () => {
    expect(
      incidentReferenceFieldFromError(
        fkError({
          constraint: "ai_incident_managements_project_id_fkey",
          detail: "La clé (project_id)=(12) n'est pas présente dans la table « projects ».",
        }),
      ),
    ).toBe("project_id");
    expect(
      incidentReferenceFieldFromError(
        fkError({
          constraint: "ai_incident_managements_model_inventory_id_fkey",
          detail:
            "Schlüssel (model_inventory_id)=(3) ist nicht in Tabelle »model_inventories« vorhanden.",
        }),
      ),
    ).toBe("model_inventory_id");
  });

  it("falls back to the English detail when the constraint has another name", () => {
    expect(
      incidentReferenceFieldFromError(
        fkError({
          constraint: "incident_owner_fk",
          detail: 'Key (assignee_id)=(9) is not present in table "users".',
        }),
      ),
    ).toBe("assignee_id");
  });

  it("reads the driver error from `original` too", () => {
    expect(
      incidentReferenceFieldFromError({
        original: {
          code: "23503",
          table: "ai_incident_managements",
          constraint: "ai_incident_managements_assignee_id_fkey",
        },
      }),
    ).toBe("assignee_id");
  });

  it("ignores other columns, other tables and other errors", () => {
    expect(
      incidentReferenceFieldFromError(
        fkError({ constraint: "ai_incident_managements_organization_id_fkey" }),
      ),
    ).toBeNull();
    expect(
      incidentReferenceFieldFromError({
        parent: {
          code: "23503",
          table: "incident_change_history",
          constraint: "incident_change_history_changed_by_user_id_fkey",
        },
      }),
    ).toBeNull();
    expect(
      incidentReferenceFieldFromError({
        parent: { code: "22P02", table: "ai_incident_managements" },
      }),
    ).toBeNull();
    expect(incidentReferenceFieldFromError(new Error("boom"))).toBeNull();
    expect(incidentReferenceFieldFromError(null)).toBeNull();
  });
});

describe("toIncidentReferenceValue", () => {
  it("stores '', null and undefined as NULL and keeps an id", () => {
    expect(toIncidentReferenceValue("")).toBeNull();
    expect(toIncidentReferenceValue(null)).toBeNull();
    expect(toIncidentReferenceValue(undefined)).toBeNull();
    expect(toIncidentReferenceValue(12)).toBe(12);
    expect(toIncidentReferenceValue("12")).toBe("12");
  });
});
