import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from "../../database/db";
import {
  getLatestRunForSubmissionQuery,
  insertClassificationRunQuery,
  setUseCaseClassificationQuery,
} from "../euAiActClassification.utils";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const sql = () => String(query.mock.calls[0][0]);
const replacements = () => (query.mock.calls[0][1] as any).replacements;

describe("euAiActClassification.utils", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("scopes inserts to the organization and serialises JSON", async () => {
    query.mockResolvedValue([{ id: 1 }]);
    await insertClassificationRunQuery(
      {
        useCaseId: null,
        intakeSubmissionId: 9,
        questionnaireVersion: 2,
        roles: ["Deployer"],
        answers: { scope: "in_scope" },
        result: { level: "Minimal risk" } as any,
        reviewerLevel: null,
        reviewerJustification: null,
        reviewedBy: null,
        source: "intake",
        createdBy: null,
      },
      5,
    );
    expect(sql()).toContain("INSERT INTO eu_ai_act_classifications");
    expect(replacements().organizationId).toBe(5);
    expect(replacements().answers).toBe('{"scope":"in_scope"}');
    expect(sql()).toContain("ARRAY[:roles]::text[]");
    expect(replacements().roles).toEqual(["Deployer"]);
    expect(replacements().role).toBe("Deployer");
  });

  it("stores no roles as the literal '{}' and a null single role", async () => {
    query.mockResolvedValue([{ id: 1 }]);
    await insertClassificationRunQuery(
      {
        useCaseId: 3,
        intakeSubmissionId: null,
        questionnaireVersion: 2,
        roles: [],
        answers: { scope: "research_only" },
        result: { level: "Out of scope" } as any,
        reviewerLevel: null,
        reviewerJustification: null,
        reviewedBy: null,
        source: "wizard",
        createdBy: 7,
      },
      5,
    );
    expect(sql()).toContain("'{}'::text[]");
    expect(replacements()).not.toHaveProperty("roles");
    expect(replacements().role).toBeNull();
  });

  it("reads the latest submission run within the organization", async () => {
    query.mockResolvedValue([]);
    await expect(getLatestRunForSubmissionQuery(9, 5)).resolves.toBeNull();
    expect(sql()).toContain("organization_id = :organizationId");
    expect(sql()).toContain("ORDER BY created_at DESC, id DESC");
  });

  it("updates only the classification columns of a use case in the organization", async () => {
    query.mockResolvedValue([[{ id: 3 }], 1]);
    await expect(
      setUseCaseClassificationQuery(3, "High risk", ["Deployer", "Provider"], 7, 5, {} as any),
    ).resolves.toBe(true);
    expect(sql()).toContain("UPDATE projects SET ai_risk_classification = :level");
    expect(sql()).toContain("high_risk_roles = ARRAY[:roles]::text[]");
    expect(replacements().roles).toEqual(["Provider", "Deployer"]);
    expect(sql()).toContain("WHERE organization_id = :organizationId AND id = :useCaseId");
  });

  it("leaves the roles unchanged when the result names none", async () => {
    query.mockResolvedValue([[{ id: 3 }], 1]);
    await setUseCaseClassificationQuery(3, "Out of scope", [], 7, 5, {} as any);
    expect(sql()).not.toContain("high_risk_roles");
    expect(replacements()).not.toHaveProperty("roles");
  });
});
