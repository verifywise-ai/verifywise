import {
  runEvidenceFreshnessSweep,
  runEvidenceFreshnessSweepAllOrgs,
} from "../evidenceFreshnessSweep";
import { getStaleEvidenceRiskIdsQuery } from "../../../../utils/evidenceHub.utils";
import { notifyEvidenceStale } from "../../../inAppNotification.service";
import { sequelize } from "../../../../database/db";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";
import { recordSnapshotIfChanged } from "../../../../utils/history/riskHistory.utils";

jest.mock("../../../../utils/evidenceHub.utils", () => ({
  getStaleEvidenceRiskIdsQuery: jest.fn(),
}));
jest.mock("../../../inAppNotification.service", () => ({
  notifyEvidenceStale: jest.fn(),
}));
jest.mock("../../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/history/riskHistory.utils", () => ({
  recordSnapshotIfChanged: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockStale = getStaleEvidenceRiskIdsQuery as jest.Mock;
const mockNotify = notifyEvidenceStale as jest.Mock;
const mockQuery = sequelize.query as jest.Mock;
const mockOrgs = getAllOrganizationsQuery as jest.Mock;
const mockSnapshot = recordSnapshotIfChanged as jest.Mock;

// In-memory risks table keyed by `${orgId}:${riskId}`, simulating exactly what
// the sweep's WHERE clauses do: the flag UPDATE only touches rows whose flag
// is NULL, the clear UPDATE only rows that are flagged and no longer stale.
const flags = new Map<string, string | null>();
const owners = new Map<string, number | null>();
const statuses = new Map<string, string>();
const key = (org: number, id: number) => `${org}:${id}`;

const resetState = () => {
  flags.clear();
  owners.clear();
  statuses.clear();
};

const seedRisk = (
  org: number,
  id: number,
  owner: number | null,
  staleAt: string | null = null,
  mitigationStatus = "In Progress",
) => {
  flags.set(key(org, id), staleAt);
  owners.set(key(org, id), owner);
  statuses.set(key(org, id), mitigationStatus);
};

mockQuery.mockImplementation(async (sql: string, opts: any) => {
  const org: number = opts.replacements.organizationId;
  if (sql.includes("evidence_stale_at = :now")) {
    const ids: number[] = opts.replacements.staleRiskIds;
    const now: Date = opts.replacements.now;
    const rows = [];
    for (const id of ids) {
      if (flags.get(key(org, id)) == null) {
        flags.set(key(org, id), now.toISOString());
        rows.push({ id, risk_name: `Risk ${id}`, risk_owner: owners.get(key(org, id)) ?? null });
      }
    }
    return [rows, rows.length];
  }
  if (sql.includes("mitigation_status = 'Requires review'")) {
    const ids: number[] = opts.replacements.flaggedIds;
    const rows = [];
    for (const id of ids) {
      if (statuses.get(key(org, id)) === "Completed") {
        statuses.set(key(org, id), "Requires review");
        rows.push({ id });
      }
    }
    return [rows, rows.length];
  }
  if (sql.includes("evidence_stale_at = NULL")) {
    const ids: number[] | undefined = opts.replacements.staleRiskIds;
    const rows = [];
    for (const [k, v] of flags) {
      const [o, idStr] = k.split(":");
      if (Number(o) !== org || v == null) continue;
      const id = Number(idStr);
      if (ids === undefined || !ids.includes(id)) {
        flags.set(k, null);
        rows.push({ id });
      }
    }
    return [rows, rows.length];
  }
  throw new Error(`unexpected SQL in mock: ${sql}`);
});

beforeEach(() => {
  jest.clearAllMocks();
  resetState();
  mockNotify.mockResolvedValue(undefined);
  mockSnapshot.mockResolvedValue(null);
});

describe("runEvidenceFreshnessSweep", () => {
  it("flags a risk with stale evidence and notifies once", async () => {
    seedRisk(1, 10, 5);
    mockStale.mockResolvedValue([10]);

    const summary = await runEvidenceFreshnessSweep(1, new Date("2026-09-09T05:00:00Z"));

    expect(summary).toEqual({ organization_id: 1, stale: 1, downgraded: 0, cleared: 0, notified: 1 });
    expect(flags.get(key(1, 10))).not.toBeNull();
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(1, { id: 10, risk_name: "Risk 10", risk_owner: 5 });
  });

  it("a second run over unchanged state writes nothing and notifies nothing", async () => {
    seedRisk(1, 10, 5);
    mockStale.mockResolvedValue([10]);

    const first = await runEvidenceFreshnessSweep(1);
    const second = await runEvidenceFreshnessSweep(1);

    expect(first).toEqual({ organization_id: 1, stale: 1, downgraded: 0, cleared: 0, notified: 1 });
    expect(second).toEqual({ organization_id: 1, stale: 0, downgraded: 0, cleared: 0, notified: 0 });
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("clears the flag when evidence is refreshed, without notifying", async () => {
    seedRisk(1, 10, 5, "2026-09-08T05:00:00.000Z");
    mockStale.mockResolvedValue([]);

    const summary = await runEvidenceFreshnessSweep(1);

    expect(summary).toEqual({ organization_id: 1, stale: 0, downgraded: 0, cleared: 1, notified: 0 });
    expect(flags.get(key(1, 10))).toBeNull();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("flags a risk with no owner but does not notify", async () => {
    seedRisk(1, 10, null);
    mockStale.mockResolvedValue([10]);

    const summary = await runEvidenceFreshnessSweep(1);

    expect(summary).toEqual({ organization_id: 1, stale: 1, downgraded: 0, cleared: 0, notified: 0 });
    expect(flags.get(key(1, 10))).not.toBeNull();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("a throwing notification does not abort the remaining risks", async () => {
    seedRisk(1, 10, 5);
    seedRisk(1, 11, 6);
    mockStale.mockResolvedValue([10, 11]);
    mockNotify.mockImplementation(async (_org: number, risk: { id: number }) => {
      if (risk.id === 10) throw new Error("delivery boom");
    });

    const summary = await runEvidenceFreshnessSweep(1);

    expect(summary).toEqual({ organization_id: 1, stale: 2, downgraded: 0, cleared: 0, notified: 1 });
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  it("downgrades a freshly flagged 'Completed' risk and leaves the others alone", async () => {
    seedRisk(1, 10, 5, null, "Completed");
    seedRisk(1, 11, 6, null, "In Progress");
    mockStale.mockResolvedValue([10, 11]);

    const summary = await runEvidenceFreshnessSweep(1);

    expect(summary).toEqual({
      organization_id: 1,
      stale: 2,
      downgraded: 1,
      cleared: 0,
      notified: 2,
    });
    expect(statuses.get(key(1, 10))).toBe("Requires review");
    expect(statuses.get(key(1, 11))).toBe("In Progress");
    expect(mockSnapshot).toHaveBeenCalledWith("mitigation_status", 1);
  });

  it("clearing the flag does not restore 'Completed'", async () => {
    seedRisk(1, 10, 5, null, "Completed");
    mockStale.mockResolvedValue([10]);
    await runEvidenceFreshnessSweep(1);

    mockStale.mockResolvedValue([]);
    const summary = await runEvidenceFreshnessSweep(1);

    expect(summary).toEqual({
      organization_id: 1,
      stale: 0,
      downgraded: 0,
      cleared: 1,
      notified: 0,
    });
    expect(flags.get(key(1, 10))).toBeNull();
    expect(statuses.get(key(1, 10))).toBe("Requires review");
  });

  it("a failing history snapshot does not fail the sweep", async () => {
    seedRisk(1, 10, 5, null, "Completed");
    mockStale.mockResolvedValue([10]);
    mockSnapshot.mockRejectedValue(new Error("history boom"));

    const summary = await runEvidenceFreshnessSweep(1);

    expect(summary.downgraded).toBe(1);
    expect(statuses.get(key(1, 10))).toBe("Requires review");
  });
});

describe("runEvidenceFreshnessSweepAllOrgs", () => {
  it("one org's failure cannot block the others", async () => {
    mockOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    seedRisk(1, 10, 5);
    mockStale.mockImplementation(async (orgId: number) => {
      if (orgId === 2) throw new Error("org boom");
      return [10];
    });

    await expect(runEvidenceFreshnessSweepAllOrgs()).resolves.toBeUndefined();

    expect(flags.get(key(1, 10))).not.toBeNull();
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
});
