jest.setTimeout(60000);

import { QueryTypes } from "sequelize";
import { sequelize } from "../../database/db";
import { cleanupDatabase, createTestOrganization, createTestUser } from "./helpers";
import {
  createTestControlEU,
  createTestModelInventory,
  createTestProject,
  createTestProjectFramework,
} from "../factories";
import { availableUseCaseTools } from "../../advisor/functions/useCaseFunctions";
import { availableProjectTools } from "../../advisor/functions/projectFunctions";
import { availableComplianceTools } from "../../advisor/functions/complianceFunctions";
import { availableModelInventoryTools } from "../../advisor/functions/modelInventoryFunctions";
import { availableAdminTools } from "../../advisor/functions/adminFunctions";
import { bridgeTools } from "../../advisor/toolBridge";
import { availableCeMarkingTools } from "../../advisor/functions/ceMarkingFunctions";
import { availableEuAiActTools } from "../../advisor/functions/euAiActFunctions";
import { availableIso42001Tools } from "../../advisor/functions/iso42001Functions";
import { availableNistAiRmfTools } from "../../advisor/functions/nistAiRmfFunctions";
import { availablePmmTools } from "../../advisor/functions/pmmFunctions";
import { availableRiskTools } from "../../advisor/functions/riskFunctions";
import { availableReadinessTools } from "../../advisor/functions/readinessFunctions";
import { toolsDefinition as ceMarkingDefs } from "../../advisor/tools/ceMarkingTools";
import { toolsDefinition as euAiActDefs } from "../../advisor/tools/euAiActTools";
import { toolsDefinition as iso42001Defs } from "../../advisor/tools/iso42001Tools";
import { toolsDefinition as nistDefs } from "../../advisor/tools/nistAiRmfTools";
import { toolsDefinition as pmmDefs } from "../../advisor/tools/pmmTools";
import { toolsDefinition as riskDefs } from "../../advisor/tools/riskTools";
import { toolsDefinition as readinessDefs } from "../../advisor/tools/readinessTools";
import { toolsDefinition as complianceDefs } from "../../advisor/tools/complianceTools";
import { toolsDefinition as modelDefs } from "../../advisor/tools/modelInventoryTools";
import { writeToolExecutors } from "../../advisor/confirmation/createWriteTool";

/**
 * U-H1: the advisor sees the use cases the user's list shows, and its use
 * case writes need useCase.edit and write access to the use case.
 */

const ROLE = { Admin: 1, Reviewer: 2, Editor: 3, Auditor: 4 } as const;
let counter = 0;
const user = (orgId: number, role: keyof typeof ROLE) => {
  counter += 1;
  return createTestUser(orgId, ROLE[role], `adv-uc-${Date.now()}-${counter}@test.com`, "Pw1!x");
};

const members = async (projectId: number): Promise<number[]> => {
  const rows = await sequelize.query<{ user_id: number }>(
    `SELECT user_id FROM projects_members WHERE project_id = :projectId ORDER BY user_id`,
    { replacements: { projectId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.user_id);
};

describe("advisor use case tools run as the user", () => {
  let orgId: number;
  let owner: number;
  let stranger: number;
  let admin: number;
  let auditor: number;
  let mine: number;
  let theirs: number;

  beforeAll(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization();
    owner = await user(orgId, "Editor");
    stranger = await user(orgId, "Editor");
    admin = await user(orgId, "Admin");
    auditor = await user(orgId, "Auditor");
    mine = await createTestProject(orgId, owner);
    theirs = await createTestProject(orgId, stranger);
    await sequelize.query(
      `INSERT INTO projects_members (organization_id, project_id, user_id)
       VALUES (:orgId, :mine, :auditor)`,
      { replacements: { orgId, mine, auditor } },
    );
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  const ids = (rows: any[]) => rows.map((r) => r.id).sort((a, b) => a - b);

  it("fetch_use_cases lists only the use cases a non-Admin can see", async () => {
    const rows = (await availableUseCaseTools.fetch_use_cases({ _userId: owner }, orgId)) as any[];
    expect(ids(rows)).toEqual([mine]);
  });

  it("fetch_use_cases lists every use case for an Admin", async () => {
    const rows = (await availableUseCaseTools.fetch_use_cases({ _userId: admin }, orgId)) as any[];
    expect(ids(rows)).toEqual([mine, theirs].sort((a, b) => a - b));
  });

  it("analytics and the executive summary count only visible use cases", async () => {
    const analytics = (await availableUseCaseTools.get_use_case_analytics(
      { _userId: owner },
      orgId,
    )) as any;
    const summary = (await availableUseCaseTools.get_use_case_executive_summary(
      { _userId: owner },
      orgId,
    )) as any;
    expect(analytics.totalUseCases).toBe(1);
    expect(summary.totalUseCases).toBe(1);
  });

  it("another organization's user sees none of these use cases", async () => {
    const otherOrg = await createTestOrganization();
    const outsider = await user(otherOrg, "Admin");
    const rows = (await availableUseCaseTools.fetch_use_cases(
      { _userId: outsider },
      orgId,
    )) as any[];
    expect(rows).toEqual([]);
  });

  describe("other advisor reads that list or open use cases", () => {
    it("list_projects lists only the use cases a non-Admin can see", async () => {
      const rows = (await availableProjectTools.list_projects({ _userId: owner }, orgId)) as any[];
      expect(ids(rows)).toEqual([mine]);
    });

    it("list_projects lists every use case for an Admin", async () => {
      const rows = (await availableProjectTools.list_projects({ _userId: admin }, orgId)) as any[];
      expect(ids(rows)).toEqual([mine, theirs].sort((a, b) => a - b));
    });

    it("list_projects lists nothing without a user", async () => {
      expect(await availableProjectTools.list_projects({}, orgId)).toEqual([]);
    });

    it("get_all_projects_compliance covers only the visible use cases", async () => {
      const result = (await availableComplianceTools.get_all_projects_compliance(
        { _userId: owner },
        orgId,
      )) as any;
      const listed = JSON.stringify(result);
      expect(listed).toContain(`"id":${mine}`);
      expect(listed).not.toContain(`"id":${theirs}`);
    });

    it("list_use_cases_for_model lists only the visible use cases", async () => {
      const model = await createTestModelInventory(orgId);
      await sequelize.query(
        `INSERT INTO model_inventories_projects_frameworks (organization_id, model_inventory_id, project_id)
         VALUES (:orgId, :model, :mine), (:orgId, :model, :theirs)`,
        { replacements: { orgId, model, mine, theirs } },
      );
      const rows = (await availableModelInventoryTools.list_use_cases_for_model(
        { model_id: model, _userId: owner },
        orgId,
      )) as any[];
      expect(rows.map((r) => r.project_id)).toEqual([mine]);
    });

    it("get_user_detail leaves out the use cases the caller cannot see", async () => {
      const detail = (await availableAdminTools.get_user_detail(
        { user_id: auditor, _userId: stranger },
        orgId,
      )) as any;
      expect(JSON.stringify(detail)).not.toContain(`"id":${mine}`);
    });

    // get_project_compliance_progress reads the dropped legacy "controls" table and
    // fails for every use case, so only get_project_stats can show the allowed path.
    it.each(["get_project_stats"])(
      "%s still answers for a use case the user can see",
      async (tool) => {
        await expect(
          availableComplianceTools[tool]({ project_id: mine, _userId: owner }, orgId),
        ).resolves.toBeDefined();
      },
    );
  });

  describe("agent_add_member_to_use_case", () => {
    const add = writeToolExecutors.get("agent_add_member_to_use_case")!;

    it("refuses a use case the requester cannot see and adds nobody", async () => {
      const result = (await add(
        { use_case_id: theirs, user_id: owner, _userId: owner },
        orgId,
      )) as any;
      expect(result).toEqual({
        success: false,
        message: `You do not have access to use case #${theirs}`,
      });
      expect(await members(theirs)).toEqual([]);
    });

    it("refuses a member without useCase.edit (Auditor) and adds nobody", async () => {
      const result = (await add(
        { use_case_id: mine, user_id: stranger, _userId: auditor },
        orgId,
      )) as any;
      expect(result.success).toBe(false);
      expect(await members(mine)).toEqual([auditor]);
    });

    it("lets the owner add a member of the organization", async () => {
      const result = (await add(
        { use_case_id: mine, user_id: stranger, _userId: owner },
        orgId,
      )) as any;
      expect(result.success).toBe(true);
      expect(await members(mine)).toEqual([auditor, stranger].sort((a, b) => a - b));
    });
  });
});

describe("advisor tools that name a use case, through the tool bridge", () => {
  let orgId: number;
  let owner: number;
  let admin: number;
  let mine: number;
  let theirs: number;

  beforeAll(async () => {
    await cleanupDatabase();
    orgId = await createTestOrganization();
    owner = await user(orgId, "Editor");
    admin = await user(orgId, "Admin");
    mine = await createTestProject(orgId, owner);
    theirs = await createTestProject(orgId, await user(orgId, "Editor"));
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  const TOOLS: Array<[string, any[], Record<string, any>, string]> = [
    ["get_ce_marking_status", ceMarkingDefs, availableCeMarkingTools, "project_id"],
    ["get_eu_ai_act_project_compliance", euAiActDefs, availableEuAiActTools, "project_id"],
    ["get_iso42001_progress", iso42001Defs, availableIso42001Tools, "project_id"],
    ["get_nist_progress", nistDefs, availableNistAiRmfTools, "project_id"],
    ["get_pmm_config", pmmDefs, availablePmmTools, "project_id"],
    ["fetch_risks", riskDefs, availableRiskTools, "projectId"],
    ["generate_recommendations", readinessDefs, availableReadinessTools, "project_id"],
    ["get_project_stats", complianceDefs, availableComplianceTools, "project_id"],
    ["get_compliance_details", complianceDefs, availableComplianceTools, "project_id"],
    ["list_models_for_use_case", modelDefs, availableModelInventoryTools, "project_id"],
  ];

  const run = (
    name: string,
    defs: any[],
    fns: Record<string, any>,
    userId: number,
    params: any,
  ) => {
    const tools = bridgeTools(
      defs.filter((d) => d.function.name === name),
      fns,
      orgId,
      userId,
    ) as unknown as Record<string, { execute: (p: Record<string, unknown>) => Promise<any> }>;
    return tools[name].execute(params);
  };

  it.each(TOOLS)("%s refuses a use case the user cannot open", async (name, defs, fns, param) => {
    const result = await run(name, defs, fns, owner, { [param]: theirs });
    expect(result).toEqual({ error: `You do not have access to use case ${theirs}` });
  });

  it.each(TOOLS)(
    "%s is not refused for the user's own use case",
    async (name, defs, fns, param) => {
      const result = await run(name, defs, fns, owner, { [param]: mine });
      expect(result?.error ?? "").not.toContain("You do not have access");
    },
  );

  it.each(TOOLS)("%s is not refused for an Admin", async (name, defs, fns, param) => {
    const result = await run(name, defs, fns, admin, { [param]: theirs });
    expect(result?.error ?? "").not.toContain("You do not have access");
  });

  describe("rows of a use case named by id", () => {
    /** A new use case the owner cannot see, so each test seeds its own rows. */
    const hidden = async () => createTestProject(orgId, await user(orgId, "Editor"));

    const euControlOf = async (projectId: number) =>
      createTestControlEU(orgId, {
        projects_frameworks_id: await createTestProjectFramework(orgId, projectId, 1),
      });

    const cycleOf = async (projectId: number, stakeholder: number | null) => {
      const [[config]] = (await sequelize.query(
        `INSERT INTO post_market_monitoring_configs (organization_id, project_id, is_active)
         VALUES (:orgId, :projectId, TRUE) RETURNING id`,
        { replacements: { orgId, projectId } },
      )) as any;
      const [[cycle]] = (await sequelize.query(
        `INSERT INTO post_market_monitoring_cycles
           (organization_id, config_id, cycle_number, due_at, assigned_stakeholder_id)
         VALUES (:orgId, :config, 1, NOW() + INTERVAL '7 days', :stakeholder) RETURNING id`,
        { replacements: { orgId, config: config.id, stakeholder } },
      )) as any;
      return cycle.id as number;
    };

    it("agent_save_eu_ai_act_control refuses a control of a use case the user cannot change", async () => {
      const other = await hidden();
      const control = await euControlOf(other);
      const result = await run(
        "agent_save_eu_ai_act_control",
        euAiActDefs,
        availableEuAiActTools,
        owner,
        {
          project_id: other,
          control_id: control,
          status: "Done",
        },
      );
      expect(result).toEqual({ error: `You do not have access to use case ${other}` });
    });

    it("agent_save_eu_ai_act_control refuses a control of another use case than the one named", async () => {
      const control = await euControlOf(await hidden());
      const result = await run(
        "agent_save_eu_ai_act_control",
        euAiActDefs,
        availableEuAiActTools,
        admin,
        {
          project_id: mine,
          control_id: control,
          status: "Done",
        },
      );
      expect(result).toEqual({ error: `You do not have access to use case ${mine}` });
    });

    it("get_pmm_cycle_detail refuses a cycle of a use case the user cannot see", async () => {
      const other = await hidden();
      const cycle = await cycleOf(other, null);
      const result = await run("get_pmm_cycle_detail", pmmDefs, availablePmmTools, owner, {
        cycle_id: cycle,
      });
      expect(result).toEqual({ error: `You do not have access to use case ${other}` });
    });

    it("get_pmm_cycle_detail opens the cycle for its stakeholder", async () => {
      const cycle = await cycleOf(await hidden(), owner);
      const result = await run("get_pmm_cycle_detail", pmmDefs, availablePmmTools, owner, {
        cycle_id: cycle,
      });
      expect(result?.error ?? "").not.toContain("You do not have access");
    });
  });
});
