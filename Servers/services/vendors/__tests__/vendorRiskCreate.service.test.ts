import type { Transaction } from "sequelize";
import type { VendorRiskModel } from "../../../domain.layer/models/vendorRisk/vendorRisk.model";

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../../domain.layer/models/vendorRisk/vendorRisk.model", () => ({
  VendorRiskModel: { createNewVendorRisk: jest.fn() },
}));
jest.mock("../../../utils/vendorRisk.utils", () => ({
  createNewVendorRiskQuery: jest.fn(),
  createVendorRiskFrameworkAssociations: jest.fn(),
}));
jest.mock("../../../utils/vendorRiskChangeHistory.utils", () => ({
  recordVendorRiskCreation: jest.fn(),
}));
jest.mock("../../../utils/riskLink.utils", () => ({
  getVendorNoticeContextQuery: jest.fn(),
}));
// The real module opens a BullMQ queue as soon as it is imported.
jest.mock("../../automations/automationProducer", () => ({
  enqueueVendorRiskLinkRecompute: jest.fn(),
}));
jest.mock("../../inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn(),
}));
jest.mock("../../riskLinks/vendorCandidates", () => ({
  notifyVendorRiskCandidates: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import { VendorRiskModel as MockedVendorRiskModel } from "../../../domain.layer/models/vendorRisk/vendorRisk.model";
import {
  createNewVendorRiskQuery,
  createVendorRiskFrameworkAssociations,
} from "../../../utils/vendorRisk.utils";
import { recordVendorRiskCreation } from "../../../utils/vendorRiskChangeHistory.utils";
import { getVendorNoticeContextQuery } from "../../../utils/riskLink.utils";
import { enqueueVendorRiskLinkRecompute } from "../../automations/automationProducer";
import { notifyUserAssigned } from "../../inAppNotification.service";
import { notifyVendorRiskCandidates } from "../../riskLinks/vendorCandidates";
import logger from "../../../utils/logger/fileLogger";
import {
  CreateVendorRiskInput,
  createVendorRiskInTransaction,
  runVendorRiskPostCommitEffects,
} from "../vendorRiskCreate.service";

type AnyMock = jest.Mock<any, any[]>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

const ORG_ID = 1;
const USER_ID = 7;
const FRONTEND_URL = "https://app.example.test";

const input: CreateVendorRiskInput = {
  vendor_id: 5,
  risk_description: "Vendor stores customer PII without encryption",
  impact_description: "Customer data could be exposed in a breach",
  likelihood: "Possible",
  risk_severity: "Major",
  action_plan: "Require encryption at rest",
  action_owner: null,
  risk_level: "High Risk",
};

const builtModel = { builtBy: "VendorRiskModel.createNewVendorRisk" };
const insertedRisk = { id: 42, ...input };
const asRisk = (overrides: Record<string, unknown> = {}): VendorRiskModel =>
  ({ ...insertedRisk, ...overrides }) as unknown as VendorRiskModel;

let transaction: Transaction;
const originalFrontendUrl = process.env.FRONTEND_URL;

// The post-commit effects run in .then chains after the function has resolved.
const flush = () => new Promise((resolve) => setImmediate(resolve));
const neverSettles = () => new Promise<never>(() => undefined);

beforeEach(() => {
  jest.resetAllMocks();
  transaction = { commit: jest.fn(), rollback: jest.fn() } as unknown as Transaction;
  asMock(MockedVendorRiskModel.createNewVendorRisk).mockResolvedValue(builtModel);
  asMock(createNewVendorRiskQuery).mockResolvedValue(insertedRisk);
  asMock(createVendorRiskFrameworkAssociations).mockResolvedValue(undefined);
  asMock(recordVendorRiskCreation).mockResolvedValue(undefined);
  asMock(enqueueVendorRiskLinkRecompute).mockResolvedValue(undefined);
  asMock(getVendorNoticeContextQuery).mockResolvedValue({ name: "Acme Corp", projectIds: [] });
  asMock(notifyVendorRiskCandidates).mockResolvedValue(undefined);
  asMock(notifyUserAssigned).mockResolvedValue(undefined);
  asMock(sequelize.query).mockImplementation(async (sql: string) => {
    if (sql.includes("FROM users")) return [{ name: "Ada", surname: "Lovelace" }];
    if (sql.includes("FROM vendors")) return [{ vendor_name: "Acme Corp" }];
    return [];
  });
  process.env.FRONTEND_URL = FRONTEND_URL;
});

afterAll(() => {
  if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = originalFrontendUrl;
});

describe("createVendorRiskInTransaction", () => {
  it("builds the model from the input and inserts it with the organization and transaction", async () => {
    const created = await createVendorRiskInTransaction(input, USER_ID, ORG_ID, transaction);

    expect(MockedVendorRiskModel.createNewVendorRisk).toHaveBeenCalledWith(input);
    expect(createNewVendorRiskQuery).toHaveBeenCalledWith(builtModel, ORG_ID, transaction);
    expect(created).toBe(insertedRisk);
  });

  it("creates the framework associations in the transaction when frameworks are given", async () => {
    await createVendorRiskInTransaction(
      { ...input, frameworks: [3, 4] },
      USER_ID,
      ORG_ID,
      transaction,
    );

    expect(createVendorRiskFrameworkAssociations).toHaveBeenCalledWith(
      [3, 4],
      insertedRisk.id,
      ORG_ID,
      transaction,
    );
  });

  it.each([
    ["undefined", undefined],
    ["empty", []],
  ])("creates no framework associations when frameworks is %s", async (_label, frameworks) => {
    await createVendorRiskInTransaction({ ...input, frameworks }, USER_ID, ORG_ID, transaction);

    expect(createVendorRiskFrameworkAssociations).not.toHaveBeenCalled();
  });

  it("swallows a framework association failure with a warning and carries on", async () => {
    asMock(createVendorRiskFrameworkAssociations).mockRejectedValue(
      new Error('relation "frameworks_vendorrisks" does not exist'),
    );

    const created = await createVendorRiskInTransaction(
      { ...input, frameworks: [3] },
      USER_ID,
      ORG_ID,
      transaction,
    );

    expect(created).toBe(insertedRisk);
    expect(recordVendorRiskCreation).toHaveBeenCalledTimes(1);
    // The logger is configured without format.splat(), so the detail has to be in the message.
    const [warning, ...rest] = asMock(logger.warn).mock.calls[0];
    expect(asMock(logger.warn)).toHaveBeenCalledTimes(1);
    expect(warning).toContain("Could not create framework associations");
    expect(warning).toContain('relation "frameworks_vendorrisks" does not exist');
    expect(rest).toEqual([]);
  });

  it("records the creation in the change history, inside the transaction, when a user is known", async () => {
    await createVendorRiskInTransaction(input, USER_ID, ORG_ID, transaction);

    expect(recordVendorRiskCreation).toHaveBeenCalledWith(
      insertedRisk.id,
      USER_ID,
      ORG_ID,
      insertedRisk,
      transaction,
    );
  });

  it("records no change history without a user id", async () => {
    const created = await createVendorRiskInTransaction(input, undefined, ORG_ID, transaction);

    expect(created).toBe(insertedRisk);
    expect(recordVendorRiskCreation).not.toHaveBeenCalled();
  });

  it("returns null, and touches nothing else, when the insert yields nothing", async () => {
    asMock(createNewVendorRiskQuery).mockResolvedValue(null);

    const created = await createVendorRiskInTransaction(
      { ...input, frameworks: [3] },
      USER_ID,
      ORG_ID,
      transaction,
    );

    expect(created).toBeNull();
    expect(createVendorRiskFrameworkAssociations).not.toHaveBeenCalled();
    expect(recordVendorRiskCreation).not.toHaveBeenCalled();
  });

  it("lets a failed insert reach the caller", async () => {
    const failure = new Error("insert failed");
    asMock(createNewVendorRiskQuery).mockRejectedValue(failure);

    await expect(createVendorRiskInTransaction(input, USER_ID, ORG_ID, transaction)).rejects.toBe(
      failure,
    );
    expect(recordVendorRiskCreation).not.toHaveBeenCalled();
  });

  it("lets a failed change history write reach the caller", async () => {
    const failure = new Error("history failed");
    asMock(recordVendorRiskCreation).mockRejectedValue(failure);

    await expect(createVendorRiskInTransaction(input, USER_ID, ORG_ID, transaction)).rejects.toBe(
      failure,
    );
  });

  it("leaves committing and rolling back to the caller", async () => {
    await createVendorRiskInTransaction(input, USER_ID, ORG_ID, transaction);
    asMock(createNewVendorRiskQuery).mockResolvedValue(null);
    await createVendorRiskInTransaction(input, USER_ID, ORG_ID, transaction);
    asMock(createNewVendorRiskQuery).mockRejectedValue(new Error("insert failed"));
    await createVendorRiskInTransaction(input, USER_ID, ORG_ID, transaction).catch(() => undefined);

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).not.toHaveBeenCalled();
  });
});

describe("runVendorRiskPostCommitEffects", () => {
  it("enqueues the related-risk recompute for the new risk", async () => {
    await runVendorRiskPostCommitEffects(asRisk(), USER_ID, ORG_ID);

    expect(enqueueVendorRiskLinkRecompute).toHaveBeenCalledTimes(1);
    expect(enqueueVendorRiskLinkRecompute).toHaveBeenCalledWith(ORG_ID, insertedRisk.id);
  });

  it("announces the risk to the owners of project risks in the vendor's use cases", async () => {
    asMock(getVendorNoticeContextQuery).mockResolvedValue({
      name: "Acme Corp",
      projectIds: [11, 12],
    });

    await runVendorRiskPostCommitEffects(asRisk(), USER_ID, ORG_ID);
    await flush();

    expect(getVendorNoticeContextQuery).toHaveBeenCalledWith(ORG_ID, insertedRisk.vendor_id);
    expect(notifyVendorRiskCandidates).toHaveBeenCalledTimes(1);
    expect(notifyVendorRiskCandidates).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      vendorId: insertedRisk.vendor_id,
      vendorName: "Acme Corp",
      projectIds: [11, 12],
      vendorRiskIds: [insertedRisk.id],
    });
  });

  it.each([
    ["has no use cases", { name: "Acme Corp", projectIds: [] }],
    ["cannot be found", null],
  ])("sends no candidate notice when the vendor %s", async (_label, context) => {
    asMock(getVendorNoticeContextQuery).mockResolvedValue(context);

    await runVendorRiskPostCommitEffects(asRisk(), USER_ID, ORG_ID);
    await flush();

    expect(getVendorNoticeContextQuery).toHaveBeenCalledTimes(1);
    expect(notifyVendorRiskCandidates).not.toHaveBeenCalled();
  });

  it("notifies the action owner, naming the assigner and the vendor", async () => {
    await runVendorRiskPostCommitEffects(asRisk({ action_owner: 9 }), USER_ID, ORG_ID);

    expect(sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM users"),
      expect.objectContaining({ replacements: { userId: USER_ID } }),
    );
    expect(sequelize.query).toHaveBeenCalledWith(
      expect.stringContaining("FROM vendors"),
      expect.objectContaining({
        replacements: { organizationId: ORG_ID, vendorId: insertedRisk.vendor_id },
      }),
    );
    expect(notifyUserAssigned).toHaveBeenCalledTimes(1);
    expect(notifyUserAssigned).toHaveBeenCalledWith(
      ORG_ID,
      9,
      {
        entityType: "Vendor Risk",
        entityId: insertedRisk.id,
        entityName: insertedRisk.risk_description,
        roleType: "Action Owner",
        entityUrl: `${FRONTEND_URL}/vendors?vendorRiskId=${insertedRisk.id}`,
      },
      "Ada Lovelace",
      FRONTEND_URL,
      {
        parentType: "Vendor",
        parentName: "Acme Corp",
        description: insertedRisk.impact_description,
      },
    );
  });

  it("uses the local frontend address when FRONTEND_URL is not set", async () => {
    delete process.env.FRONTEND_URL;

    await runVendorRiskPostCommitEffects(asRisk({ action_owner: 9 }), USER_ID, ORG_ID);

    const [, , assignment, , baseUrl] = asMock(notifyUserAssigned).mock.calls[0];
    expect(baseUrl).toBe("http://localhost:5173");
    expect(assignment.entityUrl).toBe(
      `http://localhost:5173/vendors?vendorRiskId=${insertedRisk.id}`,
    );
  });

  it("names the risk by its number when it has no description, and drops empty context", async () => {
    asMock(sequelize.query).mockImplementation(async (sql: string) =>
      sql.includes("FROM users") ? [{ name: "Ada", surname: "Lovelace" }] : [],
    );

    await runVendorRiskPostCommitEffects(
      asRisk({ action_owner: 9, risk_description: "", impact_description: "" }),
      USER_ID,
      ORG_ID,
    );

    const [, , assignment, , , context] = asMock(notifyUserAssigned).mock.calls[0];
    expect(assignment.entityName).toBe(`Vendor Risk #${insertedRisk.id}`);
    expect(context).toEqual({
      parentType: undefined,
      parentName: undefined,
      description: undefined,
    });
  });

  it("skips the vendor lookup, and the candidate notice, for a risk with no vendor", async () => {
    await runVendorRiskPostCommitEffects(
      asRisk({ action_owner: 9, vendor_id: null }),
      USER_ID,
      ORG_ID,
    );
    await flush();

    expect(sequelize.query).not.toHaveBeenCalledWith(
      expect.stringContaining("FROM vendors"),
      expect.anything(),
    );
    expect(getVendorNoticeContextQuery).not.toHaveBeenCalled();
    expect(notifyUserAssigned).toHaveBeenCalledTimes(1);
  });

  it("calls the assigner Someone when no user id is known, without looking one up", async () => {
    await runVendorRiskPostCommitEffects(asRisk({ action_owner: 9 }), undefined, ORG_ID);

    expect(sequelize.query).not.toHaveBeenCalledWith(
      expect.stringContaining("FROM users"),
      expect.anything(),
    );
    expect(asMock(notifyUserAssigned).mock.calls[0][3]).toBe("Someone");
  });

  it("calls the assigner Someone when the user cannot be found", async () => {
    asMock(sequelize.query).mockImplementation(async () => []);

    await runVendorRiskPostCommitEffects(asRisk({ action_owner: 9 }), USER_ID, ORG_ID);

    expect(asMock(notifyUserAssigned).mock.calls[0][3]).toBe("Someone");
  });

  it("sends no action owner notification, and looks nothing up, when no action owner is set", async () => {
    await runVendorRiskPostCommitEffects(asRisk({ action_owner: null }), USER_ID, ORG_ID);

    expect(notifyUserAssigned).not.toHaveBeenCalled();
    expect(sequelize.query).not.toHaveBeenCalled();
  });

  it("does nothing for a risk that has no id", async () => {
    await runVendorRiskPostCommitEffects(
      asRisk({ id: undefined, action_owner: 9 }),
      USER_ID,
      ORG_ID,
    );
    await flush();

    expect(enqueueVendorRiskLinkRecompute).not.toHaveBeenCalled();
    expect(getVendorNoticeContextQuery).not.toHaveBeenCalled();
    expect(notifyUserAssigned).not.toHaveBeenCalled();
  });

  describe("when one effect fails", () => {
    const withOwnerAndUseCases = () => {
      asMock(getVendorNoticeContextQuery).mockResolvedValue({
        name: "Acme Corp",
        projectIds: [11],
      });
      return asRisk({ action_owner: 9 });
    };

    const failures: [string, () => Error, string][] = [
      [
        "the recompute enqueue rejects",
        () => {
          const err = new Error("redis down");
          asMock(enqueueVendorRiskLinkRecompute).mockRejectedValue(err);
          return err;
        },
        "Vendor risk link recompute enqueue failed:",
      ],
      [
        "the recompute enqueue throws synchronously",
        () => {
          const err = new Error("redis down");
          asMock(enqueueVendorRiskLinkRecompute).mockImplementation(() => {
            throw err;
          });
          return err;
        },
        "Vendor risk link recompute enqueue failed:",
      ],
      [
        "the vendor context lookup rejects",
        () => {
          const err = new Error("context failed");
          asMock(getVendorNoticeContextQuery).mockRejectedValue(err);
          return err;
        },
        "Vendor risk candidate notice failed:",
      ],
      [
        "the candidate notice rejects",
        () => {
          const err = new Error("notice failed");
          asMock(notifyVendorRiskCandidates).mockRejectedValue(err);
          return err;
        },
        "Vendor risk candidate notice failed:",
      ],
      [
        "the assigner lookup rejects",
        () => {
          const err = new Error("lookup failed");
          asMock(sequelize.query).mockRejectedValue(err);
          return err;
        },
        "Failed to send action owner notification:",
      ],
      [
        "the action owner notification rejects",
        () => {
          const err = new Error("mail failed");
          asMock(notifyUserAssigned).mockRejectedValue(err);
          return err;
        },
        "Failed to send action owner notification:",
      ],
    ];

    it.each(failures)(
      "still resolves, logs the failure and runs the other effects when %s",
      async (_label, breakEffect, expectedMessage) => {
        const risk = withOwnerAndUseCases();
        const failure = breakEffect();

        await expect(
          runVendorRiskPostCommitEffects(risk, USER_ID, ORG_ID),
        ).resolves.toBeUndefined();
        await flush();

        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(expectedMessage, failure);

        const ran = {
          recompute: asMock(enqueueVendorRiskLinkRecompute).mock.calls.length,
          candidates: asMock(notifyVendorRiskCandidates).mock.calls.length,
          owner: asMock(notifyUserAssigned).mock.calls.length,
        };
        const failed = {
          "Vendor risk link recompute enqueue failed:": "recompute",
          "Vendor risk candidate notice failed:": "candidates",
          "Failed to send action owner notification:": "owner",
        }[expectedMessage] as keyof typeof ran;
        // Every effect other than the failing one still ran, once.
        for (const effect of Object.keys(ran) as (keyof typeof ran)[]) {
          if (effect !== failed) expect(ran[effect]).toBe(1);
        }
      },
    );

    it("resolves when every effect fails at once", async () => {
      const risk = withOwnerAndUseCases();
      asMock(enqueueVendorRiskLinkRecompute).mockRejectedValue(new Error("a"));
      asMock(notifyVendorRiskCandidates).mockRejectedValue(new Error("b"));
      asMock(notifyUserAssigned).mockRejectedValue(new Error("c"));

      await expect(runVendorRiskPostCommitEffects(risk, USER_ID, ORG_ID)).resolves.toBeUndefined();
      await flush();

      expect(logger.error).toHaveBeenCalledTimes(3);
    });
  });

  it("does not wait for the queue, the candidate notice or the notification to finish", async () => {
    asMock(enqueueVendorRiskLinkRecompute).mockReturnValue(neverSettles());
    asMock(getVendorNoticeContextQuery).mockReturnValue(neverSettles());
    asMock(notifyUserAssigned).mockReturnValue(neverSettles());

    let timer: NodeJS.Timeout | undefined;
    const outcome = await Promise.race([
      runVendorRiskPostCommitEffects(asRisk({ action_owner: 9 }), USER_ID, ORG_ID).then(
        () => "resolved",
      ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve("still waiting"), 500);
      }),
    ]);
    clearTimeout(timer);

    expect(outcome).toBe("resolved");
    expect(notifyUserAssigned).toHaveBeenCalledTimes(1);
  });
});
