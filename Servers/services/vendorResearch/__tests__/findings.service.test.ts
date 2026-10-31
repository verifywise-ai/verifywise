import fs from "fs";
import path from "path";
import type { Transaction } from "sequelize";
import type { IVendor } from "../../../domain.layer/interfaces/i.vendor";
import type { VendorRiskModel } from "../../../domain.layer/models/vendorRisk/vendorRisk.model";

// Every module that reaches the database or opens a queue is replaced by a factory: a bare
// jest.mock(path) would still load the real module to build the automock, and the real create
// service loads the BullMQ producer, which opens a queue.
jest.mock("../../../database/db", () => ({ sequelize: { transaction: jest.fn() } }));
jest.mock("../../../utils/vendorResearch.utils", () => ({
  getFindingByIdQuery: jest.fn(),
  markFindingAcceptedQuery: jest.fn(),
  markFindingDismissedQuery: jest.fn(),
}));
jest.mock("../../../utils/vendor.utils", () => ({ getVendorByIdQuery: jest.fn() }));
jest.mock("../../../utils/user.utils", () => ({ findUsersNotInOrganization: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../vendors/vendorRiskCreate.service", () => ({
  createVendorRiskInTransaction: jest.fn(),
  runVendorRiskPostCommitEffects: jest.fn(),
}));
const findingDecided = jest.fn();
jest.mock("../metrics", () => ({ researchMetrics: () => ({ findingDecided }) }));

import { sequelize } from "../../../database/db";
import {
  ConflictException,
  DatabaseException,
  NotFoundException,
  ValidationException,
} from "../../../domain.layer/exceptions/custom.exception";
import {
  DISMISS_REASONS,
  IVendorRiskFinding,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import { findUsersNotInOrganization } from "../../../utils/user.utils";
import { getVendorByIdQuery } from "../../../utils/vendor.utils";
import {
  getFindingByIdQuery,
  markFindingAcceptedQuery,
  markFindingDismissedQuery,
} from "../../../utils/vendorResearch.utils";
import {
  createVendorRiskInTransaction,
  runVendorRiskPostCommitEffects,
} from "../../vendors/vendorRiskCreate.service";
import { acceptFinding, dismissFinding, type FindingEdits } from "../findings.service";

type AnyMock = jest.Mock<any, any[]>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

// Different numbers for every id, so that a swapped pair of arguments shows up as a failure.
const ORG = 3;
const USER = 5;
const VENDOR = 7;
const FINDING_ID = 11;
const RISK_ID = 42;
const ASSIGNEE = 9;
const OTHER_USER = 12;

const PENDING: IVendorRiskFinding = {
  id: FINDING_ID,
  organization_id: ORG,
  vendor_id: VENDOR,
  run_id: 2,
  category: "security_incidents",
  risk_description: "Customer records were exposed in a 2026 breach.",
  impact_description: "Personal data we share with the vendor may have been accessed.",
  action_plan: "Ask the vendor for the incident report and confirm remediation.",
  likelihood: "Possible",
  risk_severity: "Major",
  risk_level: "High Risk",
  confidence: "medium",
  credibility: null,
  credibility_basis: null,
  rationale: "The vendor confirmed the access, so the effect is serious.",
  sources: [
    {
      url: "https://example.com/breach-notice",
      title: "Breach notice",
      quote: "We confirmed unauthorised access to customer records.",
      published_at: "2026-09-01",
    },
  ],
  snippet_only: false,
  status: "pending",
  dismissed_reason: null,
  dismissed_note: null,
  accepted_vendor_risk_id: null,
  decided_by: null,
  decided_at: null,
  created_at: new Date("2026-10-10T10:00:00Z"),
};

const ACCEPTED: IVendorRiskFinding = {
  ...PENDING,
  status: "accepted",
  accepted_vendor_risk_id: RISK_ID,
  decided_by: USER,
  decided_at: new Date("2026-10-10T11:00:00Z"),
};

const DISMISSED: IVendorRiskFinding = {
  ...PENDING,
  status: "dismissed",
  dismissed_reason: "other",
  decided_by: USER,
  decided_at: new Date("2026-10-10T11:00:00Z"),
};

const vendorWith = (assignee: number | null | undefined) =>
  ({ id: VENDOR, vendor_name: "Acme Corp", assignee }) as unknown as IVendor;

const CREATED_RISK = { id: RISK_ID, vendor_id: VENDOR } as unknown as VendorRiskModel;

/** What happened, in order: the transaction and the calls the accept makes. */
let events: string[];
const transaction = { id: "the-transaction" } as unknown as Transaction;

beforeEach(() => {
  jest.resetAllMocks();
  events = [];

  // The managed transaction: commit when the work resolves, roll back when it rejects.
  asMock(sequelize.transaction).mockImplementation(
    async (work: (t: Transaction) => Promise<unknown>) => {
      events.push("begin");
      try {
        const result = await work(transaction);
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
    },
  );
  asMock(getFindingByIdQuery).mockImplementation(async () => {
    events.push("find");
    return PENDING;
  });
  asMock(getVendorByIdQuery).mockImplementation(async () => {
    events.push("vendor");
    return vendorWith(ASSIGNEE);
  });
  asMock(findUsersNotInOrganization).mockImplementation(async () => {
    events.push("owner");
    return [];
  });
  asMock(createVendorRiskInTransaction).mockImplementation(async () => {
    events.push("create");
    return CREATED_RISK;
  });
  asMock(markFindingAcceptedQuery).mockImplementation(async () => {
    events.push("mark");
    return ACCEPTED;
  });
  asMock(runVendorRiskPostCommitEffects).mockImplementation(async () => {
    events.push("post-commit");
  });
  asMock(markFindingDismissedQuery).mockResolvedValue(DISMISSED);
});

const accept = (extra: { actionOwner?: number | null; edits?: FindingEdits } = {}) =>
  acceptFinding({ organizationId: ORG, findingId: FINDING_ID, userId: USER, ...extra });

const dismiss = (extra: { reason?: unknown; note?: string } = {}) =>
  dismissFinding({
    organizationId: ORG,
    findingId: FINDING_ID,
    userId: USER,
    reason: "already_covered",
    ...extra,
  } as Parameters<typeof dismissFinding>[0]);

/** The error a call rejects with. */
const rejection = async (call: Promise<unknown>): Promise<Error> => {
  try {
    await call;
  } catch (error) {
    return error as Error;
  }
  throw new Error("the call did not reject");
};

/** Nothing was written, and the effects that follow a committed risk did not run. */
const expectNothingCreated = () => {
  expect(createVendorRiskInTransaction).not.toHaveBeenCalled();
  expect(markFindingAcceptedQuery).not.toHaveBeenCalled();
  expect(runVendorRiskPostCommitEffects).not.toHaveBeenCalled();
};

describe("acceptFinding", () => {
  it("locks the finding, creates the risk from it, marks it accepted, commits, and only then runs the post-commit effects", async () => {
    const result = await accept();

    // One transaction holds the lock, the insert and the decision; the effects come after the commit.
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "begin",
      "find",
      "vendor",
      "owner",
      "create",
      "mark",
      "commit",
      "post-commit",
    ]);
    expect(getFindingByIdQuery).toHaveBeenCalledWith(ORG, FINDING_ID, {
      transaction,
      forUpdate: true,
      noWait: true,
    });
    expect(getVendorByIdQuery).toHaveBeenCalledWith(VENDOR, ORG);
    expect(createVendorRiskInTransaction).toHaveBeenCalledWith(
      {
        vendor_id: VENDOR,
        risk_description: PENDING.risk_description,
        impact_description: PENDING.impact_description,
        likelihood: "Possible",
        risk_severity: "Major",
        action_plan: PENDING.action_plan,
        action_owner: ASSIGNEE,
        risk_level: "High Risk",
      },
      USER,
      ORG,
      transaction,
    );
    expect(markFindingAcceptedQuery).toHaveBeenCalledWith(
      { organizationId: ORG, id: FINDING_ID, vendorRiskId: RISK_ID, userId: USER },
      transaction,
    );
    expect(runVendorRiskPostCommitEffects).toHaveBeenCalledWith(CREATED_RISK, USER, ORG);
    expect(result).toEqual({ finding: ACCEPTED, vendorRisk: CREATED_RISK });
  });

  it("counts the decision after the commit, by the category of the finding", async () => {
    await accept();

    expect(findingDecided).toHaveBeenCalledTimes(1);
    expect(findingDecided).toHaveBeenCalledWith({
      decision: "accepted",
      category: "security_incidents",
    });
  });

  it("passes no frameworks to the create service when the caller names none", async () => {
    // A failed framework insert aborts the whole Postgres transaction, and a finding has none.
    await accept();

    const input = asMock(createVendorRiskInTransaction).mock.calls[0][0];
    expect(input).not.toHaveProperty("frameworks");
  });

  describe("edits made before the accept", () => {
    const created = () => asMock(createVendorRiskInTransaction).mock.calls[0][0];

    it("creates the risk from the values the caller sends, and takes the vendor from the finding", async () => {
      await accept({
        edits: {
          risk_description: "A shorter, clearer description",
          impact_description: "Customers could be affected",
          action_plan: "Review the vendor's controls every quarter",
          likelihood: "Almost certain",
          risk_severity: "Minor",
          risk_level: "High risk",
          frameworks: [3, 4],
        },
      });

      expect(createVendorRiskInTransaction).toHaveBeenCalledWith(
        {
          vendor_id: VENDOR,
          risk_description: "A shorter, clearer description",
          impact_description: "Customers could be affected",
          likelihood: "Almost certain",
          risk_severity: "Minor",
          action_plan: "Review the vendor's controls every quarter",
          action_owner: ASSIGNEE,
          risk_level: "High risk",
          frameworks: [3, 4],
        },
        USER,
        ORG,
        transaction,
      );
      // The decision is still one transaction: the risk and the finding commit together.
      expect(events).toEqual([
        "begin",
        "find",
        "vendor",
        "owner",
        "create",
        "mark",
        "commit",
        "post-commit",
      ]);
    });

    it("keeps the finding's value for every field the caller does not send", async () => {
      await accept({ edits: { action_plan: "Ask for the audit report instead" } });

      expect(created()).toEqual({
        vendor_id: VENDOR,
        risk_description: PENDING.risk_description,
        impact_description: PENDING.impact_description,
        likelihood: "Possible",
        risk_severity: "Major",
        action_plan: "Ask for the audit report instead",
        action_owner: ASSIGNEE,
        risk_level: "High Risk",
      });
    });

    it("trims the texts and drops control characters from them", async () => {
      await accept({ edits: { risk_description: "  Data was\u0000 exposed \u0007 \n" } });

      expect(created().risk_description).toBe("Data was exposed");
    });

    it.each<[string, FindingEdits, string]>([
      ["a likelihood", { likelihood: "Almost certain" }, "Very High Risk"],
      ["a severity", { risk_severity: "Negligible" }, "Low Risk"],
      ["both", { likelihood: "Rare", risk_severity: "Catastrophic" }, "Medium Risk"],
    ])(
      "works the level out from the pair when %s is edited and no level is sent",
      async (_label, edits, level) => {
        await accept({ edits });

        expect(created().risk_level).toBe(level);
      },
    );

    it("keeps the level of the finding when the pair is not edited", async () => {
      await accept({ edits: { risk_description: "Another wording" } });

      expect(created().risk_level).toBe("High Risk");
    });

    it("stores the level as the caller sends it, as the vendor risk form does", async () => {
      await accept({ edits: { likelihood: "Almost certain", risk_level: "Medium risk" } });

      expect(created().risk_level).toBe("Medium risk");
    });

    it("passes the frameworks once each, and none at all for an empty list", async () => {
      await accept({ edits: { frameworks: [4, 3, 4] } });
      expect(created().frameworks).toEqual([4, 3]);

      asMock(createVendorRiskInTransaction).mockClear();
      await accept({ edits: { frameworks: [] } });
      expect(created()).not.toHaveProperty("frameworks");
    });

    it("still resolves the action owner from the caller or the vendor", async () => {
      await accept({ actionOwner: OTHER_USER, edits: { action_plan: "Another plan" } });

      expect(created().action_owner).toBe(OTHER_USER);
    });

    it("counts characters the way Postgres does, so 500 emoji fit a 500-character text", async () => {
      // Each emoji is two UTF-16 units; only the unit count would refuse this.
      const text = "\u{1F600}".repeat(500);

      await accept({ edits: { risk_description: text } });

      expect(created().risk_description).toBe(text);
    });

    it("takes the longest texts the register takes", async () => {
      await accept({
        edits: {
          risk_description: "a".repeat(500),
          impact_description: "b".repeat(500),
          action_plan: "c".repeat(1000),
          risk_level: "d".repeat(50),
        },
      });

      expect(created().risk_description).toHaveLength(500);
      expect(created().impact_description).toHaveLength(500);
      expect(created().action_plan).toHaveLength(1000);
      expect(created().risk_level).toHaveLength(50);
    });

    describe("an edit that is not valid", () => {
      /** Refused before anything is locked, read or written. */
      const expectRefusedOutright = async (edits: FindingEdits, field: string) => {
        const error = await rejection(accept({ edits }));

        expect(error).toBeInstanceOf(ValidationException);
        expect((error as ValidationException).metadata.field).toBe(field);
        // The text that was refused is not kept on the error: it can be megabytes long.
        expect((error as ValidationException).metadata.value).toBeUndefined();
        expect(sequelize.transaction).not.toHaveBeenCalled();
        expect(getFindingByIdQuery).not.toHaveBeenCalled();
        expectNothingCreated();
      };

      const notText: Array<[string, unknown]> = [
        ["null", null],
        ["a number", 5],
        ["an object", { text: "x" }],
        ["a list", ["x"]],
        ["empty", ""],
        ["blank", "   \n\t "],
        ["nothing but control characters", "\u0000\u0001\u0002"],
      ];

      it.each(notText)("refuses a risk description that is %s", async (_label, value) => {
        await expectRefusedOutright({ risk_description: value }, "risk_description");
      });

      it.each(notText)("refuses an impact description that is %s", async (_label, value) => {
        await expectRefusedOutright({ impact_description: value }, "impact_description");
      });

      it.each(notText)("refuses an action plan that is %s", async (_label, value) => {
        await expectRefusedOutright({ action_plan: value }, "action_plan");
      });

      it("refuses a risk description of 501 characters", async () => {
        await expectRefusedOutright({ risk_description: "a".repeat(501) }, "risk_description");
      });

      it("refuses an impact description of 501 characters", async () => {
        await expectRefusedOutright({ impact_description: "a".repeat(501) }, "impact_description");
      });

      it("refuses an action plan of 1001 characters", async () => {
        await expectRefusedOutright({ action_plan: "a".repeat(1001) }, "action_plan");
      });

      it("measures the length after the text is cleaned and trimmed", async () => {
        // 500 characters plus padding that goes: not too long.
        await accept({ edits: { risk_description: ` ${"a".repeat(500)}\u0000 ` } });

        expect(created().risk_description).toHaveLength(500);
      });

      it.each<[string, unknown]>([
        ["capitalised as the form's list writes it", "Almost Certain"],
        ["in lower case", "likely"],
        ["unknown", "Certain"],
        ["empty", ""],
        ["a number", 3],
        ["null", null],
      ])("refuses a likelihood that is %s", async (_label, value) => {
        await expectRefusedOutright({ likelihood: value }, "likelihood");
      });

      it.each<[string, unknown]>([
        ["in lower case", "major"],
        ["unknown", "Critical"],
        ["empty", ""],
        ["a number", 3],
        ["null", null],
      ])("refuses a severity that is %s", async (_label, value) => {
        await expectRefusedOutright({ risk_severity: value }, "risk_severity");
      });

      it.each<[string, unknown]>([
        ["null", null],
        ["a number", 3],
        ["empty", ""],
        ["blank", "  "],
        ["51 characters", "a".repeat(51)],
      ])("refuses a risk level that is %s", async (_label, value) => {
        await expectRefusedOutright({ risk_level: value }, "risk_level");
      });

      it.each<[string, unknown]>([
        ["not a list", "3"],
        ["null", null],
        ["a list with a string", [3, "4"]],
        ["a list with zero", [0]],
        ["a list with a negative number", [-1]],
        ["a list with a fraction", [1.5]],
        ["a list with a number beyond the safe integers", [Number.MAX_SAFE_INTEGER + 2]],
        ["a list with null", [null]],
        ["a list of 101 frameworks", Array.from({ length: 101 }, (_, index) => index + 1)],
      ])("refuses frameworks that are %s", async (_label, value) => {
        await expectRefusedOutright({ frameworks: value }, "frameworks");
      });

      it("takes a list of 100 frameworks", async () => {
        const frameworks = Array.from({ length: 100 }, (_, index) => index + 1);

        await accept({ edits: { frameworks } });

        expect(created().frameworks).toEqual(frameworks);
      });
    });
  });

  describe("the action owner", () => {
    const createdOwner = () => asMock(createVendorRiskInTransaction).mock.calls[0][0].action_owner;

    type Assignee = number | null | undefined;
    it.each<[string, Assignee, Assignee]>([
      ["null when none is given and the vendor has no assignee", null, undefined],
      ["null when none is given and the vendor row has no assignee value", undefined, undefined],
      ["null when null is given, although the vendor has an assignee", ASSIGNEE, null],
    ])("is %s", async (_label, assignee, requested) => {
      asMock(getVendorByIdQuery).mockResolvedValue(vendorWith(assignee));

      await accept(requested === undefined ? {} : { actionOwner: requested });

      expect(createdOwner()).toBeNull();
      // There is no user id to look up.
      expect(findUsersNotInOrganization).not.toHaveBeenCalled();
    });

    it("is the vendor's assignee when none is given and the assignee belongs to the organization", async () => {
      await accept();

      expect(findUsersNotInOrganization).toHaveBeenCalledWith([ASSIGNEE], ORG, transaction);
      expect(createdOwner()).toBe(ASSIGNEE);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("is null when none is given and the vendor's assignee is not a user of the organization, and the accept goes on", async () => {
      // Nothing in the database ties the assignee of a vendor to the vendor's organization.
      asMock(findUsersNotInOrganization).mockImplementation(async () => {
        events.push("owner");
        return [ASSIGNEE];
      });

      const result = await accept();

      expect(findUsersNotInOrganization).toHaveBeenCalledWith([ASSIGNEE], ORG, transaction);
      expect(createdOwner()).toBeNull();
      expect(events).toEqual([
        "begin",
        "find",
        "vendor",
        "owner",
        "create",
        "mark",
        "commit",
        "post-commit",
      ]);
      expect(result).toEqual({ finding: ACCEPTED, vendorRisk: CREATED_RISK });

      // The log line says what happened by ids alone: no name, no text of the finding.
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const line = String(asMock(logger.warn).mock.calls[0][0]);
      expect(line).toContain(`vendor ${VENDOR}`);
      expect(line).toContain(`org ${ORG}`);
      expect(line).toContain(`user ${ASSIGNEE}`);
      expect(line).not.toContain("Acme Corp");
      expect(line).not.toContain(PENDING.risk_description);
    });

    it.each<[string, number]>([
      ["zero", 0],
      ["negative", -3],
      ["a fraction", 1.5],
      ["not a number", NaN],
      ["beyond the safe integers", Number.MAX_SAFE_INTEGER + 2],
    ])(
      "is null when the vendor's assignee is %s, which is no user id",
      async (_label, assignee) => {
        // The lookup ignores ids like these and so reports nothing missing: that is not a yes.
        asMock(getVendorByIdQuery).mockResolvedValue(vendorWith(assignee));
        asMock(findUsersNotInOrganization).mockResolvedValue([]);

        await accept();

        expect(createdOwner()).toBeNull();
        expect(logger.warn).toHaveBeenCalledTimes(1);
      },
    );

    it("does not look at the assignee when the caller names the owner", async () => {
      await accept({ actionOwner: OTHER_USER });

      expect(findUsersNotInOrganization).toHaveBeenCalledTimes(1);
      expect(findUsersNotInOrganization).toHaveBeenCalledWith([OTHER_USER], ORG, transaction);
      expect(createdOwner()).toBe(OTHER_USER);
    });

    it("is the user that is given, when that user belongs to the organization", async () => {
      await accept({ actionOwner: OTHER_USER });

      expect(findUsersNotInOrganization).toHaveBeenCalledWith([OTHER_USER], ORG, transaction);
      expect(createdOwner()).toBe(OTHER_USER);
    });

    it("refuses a user that is not in the organization, and creates nothing", async () => {
      asMock(findUsersNotInOrganization).mockResolvedValue([OTHER_USER]);

      await expect(accept({ actionOwner: OTHER_USER })).rejects.toBeInstanceOf(ValidationException);

      expectNothingCreated();
      expect(events).toContain("rollback");
    });

    it.each<[string, number]>([
      ["zero", 0],
      ["negative", -3],
      ["a fraction", 1.5],
      ["not a number", NaN],
      ["infinite", Infinity],
      ["beyond the safe integers", Number.MAX_SAFE_INTEGER + 2],
    ])("refuses an id that is %s without taking it for a user", async (_label, actionOwner) => {
      // The lookup ignores ids like these and so reports nothing missing: the service must not
      // read that as "this user belongs to the organization".
      asMock(findUsersNotInOrganization).mockResolvedValue([]);

      await expect(accept({ actionOwner })).rejects.toBeInstanceOf(ValidationException);

      expectNothingCreated();
    });
  });

  describe("a finding that cannot be accepted", () => {
    it.each<[string, IVendorRiskFinding]>([
      ["accepted", ACCEPTED],
      ["dismissed", DISMISSED],
    ])(
      "is refused with a conflict when it is already %s, and nothing is created",
      async (_s, found) => {
        asMock(getFindingByIdQuery).mockResolvedValue(found);

        await expect(accept()).rejects.toBeInstanceOf(ConflictException);

        expectNothingCreated();
        expect(events).not.toContain("commit");
      },
    );

    it("is refused as not found when the organization has no such finding", async () => {
      asMock(getFindingByIdQuery).mockResolvedValue(null);

      await expect(accept()).rejects.toBeInstanceOf(NotFoundException);

      expectNothingCreated();
      expect(getVendorByIdQuery).not.toHaveBeenCalled();
    });

    it("is refused as not found when its vendor is gone, and nothing is created", async () => {
      asMock(getVendorByIdQuery).mockResolvedValue(null);

      await expect(accept()).rejects.toBeInstanceOf(NotFoundException);

      expect(getVendorByIdQuery).toHaveBeenCalledWith(VENDOR, ORG);
      expectNothingCreated();
    });
  });

  describe("a finding that another decision holds right now", () => {
    // Postgres refuses a NOWAIT lock with 55P03 (lock_not_available). Sequelize wraps the driver's
    // error and exposes it as both `parent` and `original`.
    const lockNotAvailable = (shape: "parent" | "original") =>
      Object.assign(new Error('could not obtain lock on row in relation "vendor_risk_findings"'), {
        [shape]: { code: "55P03" },
      });

    it.each<["parent" | "original"]>([["parent"], ["original"]])(
      "is refused at once with a conflict that asks to try again, when the lock is not available (reported as `%s`)",
      async (shape) => {
        asMock(getFindingByIdQuery).mockImplementation(async () => {
          events.push("find");
          throw lockNotAvailable(shape);
        });

        const error = await rejection(accept());

        expect(error).toBeInstanceOf(ConflictException);
        // The holder may be the status job relabelling the finding, which stays pending: the
        // finding is not said to be decided.
        expect(error.message).toBe("This finding is being updated. Try again in a moment.");
        // It does not go on to the vendor, and the transaction ends without a commit.
        expect(events).toEqual(["begin", "find", "rollback"]);
        expect(getVendorByIdQuery).not.toHaveBeenCalled();
        expectNothingCreated();
      },
    );

    it.each<[string, unknown]>([
      ["a plain error", new Error("connection lost")],
      [
        "a deadlock (40P01)",
        Object.assign(new Error("deadlock detected"), {
          parent: { code: "40P01" },
          original: { code: "40P01" },
        }),
      ],
      [
        "a unique violation (23505)",
        Object.assign(new Error("duplicate key"), { parent: { code: "23505" } }),
      ],
      ["a value that is not an error", "boom"],
    ])("rethrows %s as it is", async (_label, failure) => {
      asMock(getFindingByIdQuery).mockRejectedValue(failure);

      await expect(accept()).rejects.toBe(failure);

      expectNothingCreated();
      expect(events).toContain("rollback");
    });
  });

  describe("when a step fails", () => {
    it("counts nothing when the accept is rolled back", async () => {
      asMock(createVendorRiskInTransaction).mockRejectedValue(new Error("insert failed"));

      await expect(accept()).rejects.toThrow();

      expect(findingDecided).not.toHaveBeenCalled();
    });

    it("rolls back, does not mark the finding and runs no effects when the create rejects", async () => {
      const failure = new Error("insert failed");
      asMock(createVendorRiskInTransaction).mockRejectedValue(failure);

      await expect(accept()).rejects.toBe(failure);

      expect(events).toEqual(["begin", "find", "vendor", "owner", "rollback"]);
      expect(markFindingAcceptedQuery).not.toHaveBeenCalled();
      expect(runVendorRiskPostCommitEffects).not.toHaveBeenCalled();
    });

    it("treats a create that returns nothing as a failure: rolled back, finding not marked, no effects", async () => {
      asMock(createVendorRiskInTransaction).mockResolvedValue(null);

      await expect(accept()).rejects.toBeInstanceOf(DatabaseException);

      expect(events).toEqual(["begin", "find", "vendor", "owner", "rollback"]);
      expect(markFindingAcceptedQuery).not.toHaveBeenCalled();
      expect(runVendorRiskPostCommitEffects).not.toHaveBeenCalled();
    });

    it("rolls the risk back and runs no effects when the finding cannot be marked after the lock", async () => {
      // Under the lock this cannot happen. If it did, committing would leave a risk in the
      // register while the finding stays pending, and the next accept would create a second one.
      asMock(markFindingAcceptedQuery).mockImplementation(async () => {
        events.push("mark");
        return null;
      });

      await expect(accept()).rejects.toBeInstanceOf(DatabaseException);

      expect(events).toEqual(["begin", "find", "vendor", "owner", "create", "mark", "rollback"]);
      expect(runVendorRiskPostCommitEffects).not.toHaveBeenCalled();
    });

    it("rolls back when the mark rejects", async () => {
      const failure = new Error("update failed");
      asMock(markFindingAcceptedQuery).mockRejectedValue(failure);

      await expect(accept()).rejects.toBe(failure);

      expect(events).toContain("rollback");
      expect(events).not.toContain("commit");
      expect(runVendorRiskPostCommitEffects).not.toHaveBeenCalled();
    });
  });
});

describe("dismissFinding", () => {
  const storedNote = () => asMock(markFindingDismissedQuery).mock.calls[0][0].note;
  const storedReason = () => asMock(markFindingDismissedQuery).mock.calls[0][0].reason;

  it("stores the reason, the note and who decided, and returns the finding", async () => {
    const result = await dismiss({ note: "Tracked in the register already." });

    expect(markFindingDismissedQuery).toHaveBeenCalledTimes(1);
    expect(markFindingDismissedQuery).toHaveBeenCalledWith({
      organizationId: ORG,
      id: FINDING_ID,
      reason: "already_covered",
      note: "Tracked in the register already.",
      userId: USER,
    });
    expect(result).toBe(DISMISSED);
    // One conditional update decides it, so two decisions cannot both win: there is no read of
    // the finding first.
    expect(getFindingByIdQuery).not.toHaveBeenCalled();
  });

  it("has the two reasons that tell a wrong company or an old source from a wrong risk", () => {
    expect(DISMISS_REASONS).toEqual(expect.arrayContaining(["wrong_vendor", "outdated"]));
  });

  it("counts the decision with the reason and the category of the finding", async () => {
    await dismiss({ reason: "wrong_vendor" });

    expect(findingDecided).toHaveBeenCalledTimes(1);
    expect(findingDecided).toHaveBeenCalledWith({
      decision: "dismissed",
      category: "security_incidents",
      reason: "wrong_vendor",
    });
  });

  it("counts nothing for a dismissal that was refused", async () => {
    await expect(dismiss({ reason: "nope" })).rejects.toBeInstanceOf(ValidationException);
    asMock(markFindingDismissedQuery).mockResolvedValue(null);
    asMock(getFindingByIdQuery).mockResolvedValue(ACCEPTED);
    await expect(dismiss()).rejects.toBeInstanceOf(ConflictException);

    expect(findingDecided).not.toHaveBeenCalled();
  });

  it.each(DISMISS_REASONS)("accepts the reason %s", async (reason) => {
    await dismiss({ reason });

    expect(storedReason()).toBe(reason);
  });

  it.each<[string, unknown]>([
    ["an unknown word", "nope"],
    ["empty", ""],
    ["in capitals", "NOT_APPLICABLE"],
    ["missing", undefined],
    ["null", null],
    ["a number", 5],
    ["a prototype key", "constructor"],
  ])("refuses a reason that is %s, and writes nothing", async (_label, reason) => {
    await expect(dismiss({ reason })).rejects.toBeInstanceOf(ValidationException);

    expect(markFindingDismissedQuery).not.toHaveBeenCalled();
  });

  describe("the note", () => {
    it.each<[string, string | undefined, string | null]>([
      ["none", undefined, null],
      ["only spaces", "   \t ", null],
      ["only control characters", "\u0000\u0001\u0008", null],
      ["padded", "  Tracked already.  ", "Tracked already."],
      [
        "a NUL inside the text, which Postgres refuses",
        "Tracked\u0000 already.",
        "Tracked already.",
      ],
      ["a NUL between spaces that is all that is left", "  \u0000  ", null],
      ["a lone surrogate", "Tracked\uD800 already.", "Tracked\uFFFD already."],
      ["lines", "First line.\nSecond line.", "First line.\nSecond line."],
    ])("is stored cleaned and trimmed: %s", async (_label, note, expected) => {
      await dismiss(note === undefined ? {} : { note });

      expect(storedNote()).toBe(expected);
    });

    it("is cleaned and trimmed before its length is counted", async () => {
      // 500 characters of text, padded and with NULs: 520 as received, 500 once cleaned.
      const text = "a".repeat(500);
      await dismiss({ note: `  ${text}\u0000\u0000  ${"\u0000".repeat(14)}` });

      expect(storedNote()).toBe(text);
    });

    it("may be 500 characters and no more", async () => {
      await dismiss({ note: "b".repeat(500) });
      expect(storedNote()).toBe("b".repeat(500));
      asMock(markFindingDismissedQuery).mockClear();

      await expect(dismiss({ note: "b".repeat(501) })).rejects.toBeInstanceOf(ValidationException);
      expect(markFindingDismissedQuery).not.toHaveBeenCalled();
    });

    it("is refused for its length alone when it has more than twice 500 UTF-16 units, without listing its characters", async () => {
      // A character takes at most two units, so 1001 units are surely more than 500 characters.
      // The characters of a text of megabytes are not listed to find that out.
      const iterate = jest.spyOn(String.prototype, Symbol.iterator);
      try {
        await expect(dismiss({ note: "d".repeat(1001) })).rejects.toBeInstanceOf(
          ValidationException,
        );
        await expect(dismiss({ note: "\u{1F600}".repeat(501) })).rejects.toBeInstanceOf(
          ValidationException,
        );
        expect(iterate).not.toHaveBeenCalled();
      } finally {
        iterate.mockRestore();
      }
      expect(markFindingDismissedQuery).not.toHaveBeenCalled();
    });

    it("still counts the characters of a note of 1000 units or fewer, and refuses 501 of them", async () => {
      // 1000 units are within the quick limit, so the characters decide: 1000 of them are too many,
      // and 500 emoji (also 1000 units) are exactly enough.
      await expect(dismiss({ note: "e".repeat(1000) })).rejects.toBeInstanceOf(ValidationException);
      expect(markFindingDismissedQuery).not.toHaveBeenCalled();

      await dismiss({ note: "\u{1F600}".repeat(500) });
      expect(storedNote()).toBe("\u{1F600}".repeat(500));
    });

    it("counts characters the way the column does, not UTF-16 units", async () => {
      // An astral character is one character to Postgres and two units to String.length.
      const astral500 = "\u{1F600}".repeat(500);
      expect(astral500.length).toBe(1000);
      await dismiss({ note: astral500 });
      expect(storedNote()).toBe(astral500);
      asMock(markFindingDismissedQuery).mockClear();

      await expect(dismiss({ note: "\u{1F600}".repeat(501) })).rejects.toBeInstanceOf(
        ValidationException,
      );
      expect(markFindingDismissedQuery).not.toHaveBeenCalled();
    });
  });

  describe("a finding that cannot be dismissed", () => {
    it.each<[string, IVendorRiskFinding]>([
      ["accepted", ACCEPTED],
      ["dismissed", DISMISSED],
    ])("is refused with a conflict when it is already %s", async (_s, found) => {
      asMock(markFindingDismissedQuery).mockResolvedValue(null);
      asMock(getFindingByIdQuery).mockResolvedValue(found);

      await expect(dismiss()).rejects.toBeInstanceOf(ConflictException);

      // Only the organization and the id: the lookup that tells a conflict from a missing finding
      // is scoped like the update.
      expect(getFindingByIdQuery).toHaveBeenCalledWith(ORG, FINDING_ID);
    });

    it("is refused as not found when the organization has no such finding", async () => {
      asMock(markFindingDismissedQuery).mockResolvedValue(null);
      asMock(getFindingByIdQuery).mockResolvedValue(null);

      await expect(dismiss()).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe("the refusal messages", () => {
  const dictionaries = Object.fromEntries(
    ["en", "de", "fr"].map((lang) => [
      lang,
      JSON.parse(
        fs.readFileSync(path.join(__dirname, "..", "..", "..", "locales", `${lang}.json`), "utf8"),
      ) as Record<string, string>,
    ]),
  );

  it("name the vendor risk register as the rest of the French and German interface does", () => {
    const message = "The risk could not be added to the vendor risk register";

    // "risques fournisseurs" is the French for vendor risks elsewhere, and "Anbieterrisiko" the German.
    expect(dictionaries.fr[message]).toBe(
      "Le risque n'a pas pu être ajouté au registre des risques fournisseurs",
    );
    expect(dictionaries.de[message]).toContain("Anbieterrisiko");
  });

  it("all have a translation in English, German and French, because the controller translates them", async () => {
    asMock(getFindingByIdQuery).mockResolvedValue(null);
    const notFound = await rejection(accept());

    asMock(getFindingByIdQuery).mockResolvedValue(ACCEPTED);
    const alreadyDecided = await rejection(accept());

    asMock(getFindingByIdQuery).mockResolvedValue(PENDING);
    asMock(getVendorByIdQuery).mockResolvedValue(null);
    const vendorGone = await rejection(accept());

    asMock(getVendorByIdQuery).mockResolvedValue(vendorWith(ASSIGNEE));
    asMock(findUsersNotInOrganization).mockResolvedValue([OTHER_USER]);
    const notAUser = await rejection(accept({ actionOwner: OTHER_USER }));

    asMock(createVendorRiskInTransaction).mockResolvedValue(null);
    const notCreated = await rejection(accept());

    const badReason = await rejection(dismiss({ reason: "nope" }));
    const longNote = await rejection(dismiss({ note: "c".repeat(501) }));

    const messages = [
      notFound,
      alreadyDecided,
      vendorGone,
      notAUser,
      notCreated,
      badReason,
      longNote,
    ].map((error) => error.message);
    expect(new Set(messages).size).toBe(messages.length);
    for (const message of messages) {
      for (const [lang, dictionary] of Object.entries(dictionaries)) {
        expect({ lang, message, translation: dictionary[message] }).toEqual({
          lang,
          message,
          translation: expect.any(String),
        });
      }
    }
  });
});
