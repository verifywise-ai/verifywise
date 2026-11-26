/**
 * EU AI Act rows copied from a use case on upgrade (copied_from_project_id,
 * migration 20261126150000) carry a "review it" marker: the tracker loaders
 * return it with the use case's label, and any save of the row clears it.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../changeHistory.base.utils", () => ({
  ...(jest.requireActual("../changeHistory.base.utils") as object),
  recordUpdateChanges: jest.fn(),
}));
jest.mock("../files/evidenceFiles.utils", () => ({
  getEvidenceFilesForEntities: jest.fn(async () => new Map()),
}));

import { sequelize } from "../../database/db";
import {
  getAllQuestionsQuery,
  getControlByIdQuery,
  getControlStructByControlCategoryIdForAProjectQuery,
  getSubControlsByIdQuery,
  updateControlEUByIdQuery,
  updateQuestionEUByIdQuery,
  updateSubcontrolEUByIdQuery,
} from "../eu.utils";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<unknown>>;
const transaction = {} as any;

const sqlOf = (pattern: RegExp) =>
  mockQuery.mock.calls.map(([sql]) => String(sql)).filter((sql) => pattern.test(sql));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: any, options?: any) => {
    if (/^\s*(UPDATE|SELECT \*)/.test(String(sql))) {
      return [[{ id: 5, dataValues: {} }], 1];
    }
    return options?.type ? [] : [[], 0];
  });
});

describe("saving clears the copied-from-use-case marker", () => {
  it("on the control", async () => {
    await updateControlEUByIdQuery(7, { owner: 3, status: "Done" } as any, 1, transaction, 2);
    const [update] = sqlOf(/^\s*UPDATE controls_eu/);
    expect(update).toContain("copied_from_project_id = NULL");
    expect(update).toContain("WHERE organization_id = :organizationId AND id = :id");
  });

  it("on a subcontrol with changed fields", async () => {
    await updateSubcontrolEUByIdQuery(
      41,
      { status: "In progress" } as any,
      [],
      [],
      [],
      1,
      transaction,
      2,
    );
    const [update] = sqlOf(/^\s*UPDATE subcontrols_eu/);
    expect(update).toContain("status = :status");
    expect(update).toContain("copied_from_project_id = NULL");
  });

  it("on a subcontrol saved without field changes (files only)", async () => {
    await updateSubcontrolEUByIdQuery(41, {} as any, [], [], [], 1, transaction, 2);
    const [update] = sqlOf(/^\s*UPDATE subcontrols_eu/);
    expect(update).toContain("SET copied_from_project_id = NULL");
    expect(update).toContain("RETURNING *");
  });

  it("on an answer, with or without changed fields", async () => {
    await updateQuestionEUByIdQuery(9, { answer: "Yes", status: "Done" }, 1, transaction);
    await updateQuestionEUByIdQuery(9, {}, 1, transaction);
    const updates = sqlOf(/^\s*UPDATE answers_eu/);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toContain(
      "answer = :answer, status = :status, copied_from_project_id = NULL",
    );
    expect(updates[1]).toContain("SET copied_from_project_id = NULL");
  });
});

describe("the tracker loaders return the marker", () => {
  const expectMarker = (sql: string, row: string) => {
    expect(sql).toContain(`${row}.copied_from_project_id AS copied_from_project_id`);
    expect(sql).toContain("AS copied_from_use_case");
    expect(sql).toContain(
      `LEFT JOIN projects cp ON cp.id = ${row}.copied_from_project_id AND cp.organization_id = ${row}.organization_id`,
    );
    expect(sql).toContain("cp.project_title || ' (' || cp.uc_id || ')'");
  };

  it("for a control", async () => {
    await getControlByIdQuery(7, 1);
    expectMarker(sqlOf(/FROM controls_eu c JOIN controls_struct_eu cs/)[0], "c");
  });

  it("for the controls of a category", async () => {
    await getControlStructByControlCategoryIdForAProjectQuery(
      3,
      11,
      undefined,
      undefined,
      undefined,
      1,
    );
    expectMarker(sqlOf(/SELECT cs\.\*, c\.id AS control_id/)[0], "c");
  });

  it("for subcontrols", async () => {
    await getSubControlsByIdQuery(7, undefined, undefined, undefined, 1);
    expectMarker(sqlOf(/FROM subcontrols_eu sc/)[0], "sc");
  });

  it("for answers", async () => {
    await getAllQuestionsQuery(4, 2, 1);
    expectMarker(sqlOf(/FROM questions_struct_eu q JOIN answers_eu a/)[0], "a");
  });
});
