import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import {
  createNewProjectQuery,
  getProjectByIdQuery,
  updateProjectByIdQuery,
} from "../project.utils";
import { sequelize } from "../../database/db";

const query = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const transaction = {} as any;

/** A row as Sequelize returns it with mapToModel: the values live on dataValues. */
const modelRow = (values: Record<string, unknown>) => ({ ...values, dataValues: { ...values } });

function mockDb(row: Record<string, unknown>) {
  query.mockImplementation(async (sql: string, opts: any = {}) => {
    if (sql.startsWith("SELECT user_id AS id FROM organization_members"))
      return opts.replacements.userIds.map((id: number) => ({ id }));
    if (sql.startsWith("SELECT id FROM frameworks")) return [[], 0];
    if (sql.includes("nextval('project_uc_id_seq')")) return [{ next_id: 1 }];
    if (sql.startsWith("INSERT INTO projects (")) return [modelRow(row)];
    if (sql.includes("FOR UPDATE")) return [{ id: 1 }];
    if (sql.startsWith("UPDATE projects SET")) return [modelRow(row)];
    if (sql.startsWith("SELECT * FROM projects")) return [modelRow(row)];
    if (sql.includes("FROM projects_frameworks")) return [[], 0];
    if (sql.includes("FROM automation_triggers")) return [[], 0];
    return [];
  });
}

const call = (prefix: string) => {
  const found = query.mock.calls.find((c) => String(c[0]).startsWith(prefix));
  if (!found) throw new Error(`no query starting with ${prefix}`);
  return { sql: String(found[0]), replacements: (found[1] as any).replacements };
};

describe("project.utils high-risk roles", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("inserts the roles normalised through ARRAY[...]::text[]", async () => {
    mockDb({ id: 1, high_risk_roles: ["Provider", "Deployer"] });
    const created = await createNewProjectQuery(
      {
        project_title: "P",
        owner: 1,
        high_risk_roles: ["Deployer", "Provider", "Deployer"],
      } as any,
      [],
      [],
      1,
      1,
      transaction,
    );
    const insert = call("INSERT INTO projects (");
    expect(insert.sql).toContain("ARRAY[:high_risk_roles]::text[]");
    expect(insert.sql).not.toContain("type_of_high_risk_role");
    expect(insert.replacements.high_risk_roles).toEqual(["Provider", "Deployer"]);
    expect((created.dataValues as any).type_of_high_risk_role).toBe("Provider");
  });

  it("inserts no roles as the literal '{}' without binding an empty array", async () => {
    mockDb({ id: 1, high_risk_roles: [] });
    await createNewProjectQuery({ project_title: "P", owner: 1 } as any, [], [], 1, 1, transaction);
    const insert = call("INSERT INTO projects (");
    expect(insert.sql).toContain("'{}'::text[]");
    expect(insert.replacements).not.toHaveProperty("high_risk_roles");
  });

  it("updates the roles through ARRAY[...]::text[] and returns the derived role", async () => {
    mockDb({ id: 1, high_risk_roles: ["Deployer"] });
    const updated = await updateProjectByIdQuery(
      1,
      { high_risk_roles: ["Deployer"] } as any,
      undefined,
      1,
      transaction,
    );
    const update = call("UPDATE projects SET");
    expect(update.sql).toContain("high_risk_roles = ARRAY[:high_risk_roles]::text[]");
    expect(update.replacements.high_risk_roles).toEqual(["Deployer"]);
    expect(updated?.type_of_high_risk_role).toBe("Deployer");
  });

  it("clears the roles with the literal '{}'", async () => {
    mockDb({ id: 1, high_risk_roles: [] });
    await updateProjectByIdQuery(1, { high_risk_roles: [] } as any, undefined, 1, transaction);
    expect(call("UPDATE projects SET").sql).toContain("high_risk_roles = '{}'::text[]");
  });

  it("leaves the roles alone when the update does not send them", async () => {
    mockDb({ id: 1, high_risk_roles: ["Provider"] });
    await updateProjectByIdQuery(1, { project_title: "Q" } as any, undefined, 1, transaction);
    expect(call("UPDATE projects SET").sql).not.toContain("high_risk_roles");
  });

  it("adds the derived role to a use case read by id", async () => {
    mockDb({ id: 1, high_risk_roles: ["Deployer", "Provider"] });
    const project = (await getProjectByIdQuery(1, 1)) as any;
    expect(project.type_of_high_risk_role).toBe("Provider");
    expect(project.dataValues.high_risk_roles).toEqual(["Provider", "Deployer"]);
  });
});
