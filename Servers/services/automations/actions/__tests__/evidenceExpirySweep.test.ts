import { QueryTypes } from "sequelize";
import { sequelize } from "../../../../database/db";
import { runEvidenceExpirySweep, runEvidenceExpirySweepAllOrgs } from "../evidenceExpirySweep";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";
import { getAllUsersQuery } from "../../../../utils/user.utils";
import { getEvidenceHubOrgSettings } from "../../../../utils/evidenceHubSettings.utils";
import { notifyEvidenceExpired } from "../../../inAppNotification.service";

jest.mock("../../../../database/db", () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/user.utils", () => ({
  getAllUsersQuery: jest.fn(),
}));
jest.mock("../../../../utils/evidenceHubSettings.utils", () => ({
  getEvidenceHubOrgSettings: jest.fn(),
}));
jest.mock("../../../inAppNotification.service", () => ({
  notifyEvidenceExpired: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockQuery = sequelize.query as jest.Mock;
const mockAllOrgs = getAllOrganizationsQuery as jest.Mock;
const mockAllUsers = getAllUsersQuery as jest.Mock;
const mockGetSettings = getEvidenceHubOrgSettings as jest.Mock;
const mockNotify = notifyEvidenceExpired as jest.Mock;

const FLAG_SQL = "SET expired_at";
const SELECT_UNNOTIFIED_SQL = "expiry_notified_at IS NULL";
const MARK_NOTIFIED_SQL = "SET expiry_notified_at";
const ARCHIVE_SQL = "SET archived_at";

/** Route the mocked sequelize.query by which statement the action issued. */
function mockQueryRouting(handlers: {
  flagged?: object[];
  unnotified?: object[];
  archived?: object[];
}) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes(FLAG_SQL)) return handlers.flagged ?? [];
    if (sql.includes(SELECT_UNNOTIFIED_SQL)) return handlers.unnotified ?? [];
    if (sql.includes(MARK_NOTIFIED_SQL)) return [];
    if (sql.includes(ARCHIVE_SQL)) return handlers.archived ?? [];
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });
}

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.EVIDENCE_RETENTION_ARCHIVE_ENABLED;
  mockAllOrgs.mockResolvedValue([{ id: 1 }]);
  mockAllUsers.mockResolvedValue([
    { id: 10, role_id: 1 },
    { id: 11, role_id: 2 },
  ]);
  mockGetSettings.mockResolvedValue({
    organization_id: 1,
    default_retention_period: null,
    archive_on_expiry: false,
  });
  mockNotify.mockResolvedValue(undefined);
  mockQueryRouting({});
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("runEvidenceExpirySweep", () => {
  it("flags past-expiry records and returns them with a summary", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 5, evidence_name: "SOC 2 report", expiry_date: "2026-01-01", reviewer_id: 11 },
    ]);

    const { summary, records } = await runEvidenceExpirySweep(1);

    expect(summary).toEqual({
      organization_id: 1,
      newly_expired: 1,
      notified: 0,
      archived: 0,
    });
    expect(records).toHaveLength(1);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain(FLAG_SQL);
    expect(sql).toContain("expiry_date IS NOT NULL");
    expect(sql).toContain("expired_at IS NULL");
    expect(options).toMatchObject({
      replacements: { organizationId: 1 },
      type: QueryTypes.SELECT,
    });
  });
});

describe("runEvidenceExpirySweepAllOrgs", () => {
  it("isolates a failing org and still sweeps the others", async () => {
    mockAllOrgs.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockQuery.mockImplementation(async (sql: string, options?: any) => {
      if (options?.replacements?.organizationId === 2) throw new Error("boom");
      if (sql.includes(SELECT_UNNOTIFIED_SQL)) return [];
      return [];
    });

    await expect(runEvidenceExpirySweepAllOrgs()).resolves.toBeUndefined();
    const flagCalls = mockQuery.mock.calls.filter(([sql]) => sql.includes(FLAG_SQL));
    expect(flagCalls.map(([, o]) => o.replacements.organizationId)).toEqual([1, 2]);
  });

  it("skips orgs with undefined/null ids", async () => {
    mockAllOrgs.mockResolvedValue([{ id: undefined }, { id: 7 }]);
    await runEvidenceExpirySweepAllOrgs();
    const flagCalls = mockQuery.mock.calls.filter(([sql]) => sql.includes(FLAG_SQL));
    expect(flagCalls).toHaveLength(1);
    expect(flagCalls[0][1].replacements.organizationId).toBe(7);
  });

  it("does nothing when no records are expired or unnotified", async () => {
    await runEvidenceExpirySweepAllOrgs();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("expiry notifications", () => {
  it("notifies the reviewer and marks expiry_notified_at", async () => {
    mockQueryRouting({
      unnotified: [
        { id: 5, evidence_name: "SOC 2 report", expiry_date: "2026-01-01", reviewer_id: 11 },
      ],
    });

    await runEvidenceExpirySweepAllOrgs();

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      11,
      { id: 5, name: "SOC 2 report", expiryDate: "2026-01-01" },
      expect.any(String),
    );
    const markCalls = mockQuery.mock.calls.filter(([sql]) => sql.includes(MARK_NOTIFIED_SQL));
    expect(markCalls).toHaveLength(1);
    expect(markCalls[0][1].replacements).toEqual({ organizationId: 1, id: 5 });
  });

  it("falls back to org admins when no reviewer is set", async () => {
    mockQueryRouting({
      unnotified: [
        { id: 6, evidence_name: "Pen test", expiry_date: "2026-01-02", reviewer_id: null },
      ],
    });

    await runEvidenceExpirySweepAllOrgs();

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][1]).toBe(10); // admin (role_id 1), not the non-admin
  });

  it("does not mark notified when notification fails, so the next run retries", async () => {
    mockNotify.mockRejectedValue(new Error("smtp down"));
    mockQueryRouting({
      unnotified: [
        { id: 5, evidence_name: "SOC 2 report", expiry_date: "2026-01-01", reviewer_id: 11 },
      ],
    });

    await expect(runEvidenceExpirySweepAllOrgs()).resolves.toBeUndefined();

    const markCalls = mockQuery.mock.calls.filter(([sql]) => sql.includes(MARK_NOTIFIED_SQL));
    expect(markCalls).toHaveLength(0);
  });
});

describe("archival gating", () => {
  const unnotified = [];

  it("never archives when the env flag is unset, even if the org opted in", async () => {
    mockGetSettings.mockResolvedValue({
      organization_id: 1,
      default_retention_period: null,
      archive_on_expiry: true,
    });
    mockQueryRouting({ unnotified });

    await runEvidenceExpirySweepAllOrgs();

    expect(mockQuery.mock.calls.some(([sql]) => sql.includes(ARCHIVE_SQL))).toBe(false);
  });

  it("never archives when the org has not opted in, even with the env flag on", async () => {
    process.env.EVIDENCE_RETENTION_ARCHIVE_ENABLED = "true";
    mockQueryRouting({ unnotified });

    await runEvidenceExpirySweepAllOrgs();

    expect(mockQuery.mock.calls.some(([sql]) => sql.includes(ARCHIVE_SQL))).toBe(false);
  });

  it("archives only when both the env flag and the org opt-in are on", async () => {
    process.env.EVIDENCE_RETENTION_ARCHIVE_ENABLED = "true";
    mockGetSettings.mockResolvedValue({
      organization_id: 1,
      default_retention_period: null,
      archive_on_expiry: true,
    });
    mockQueryRouting({ unnotified, archived: [{ id: 5 }] });

    await runEvidenceExpirySweepAllOrgs();

    const archiveCalls = mockQuery.mock.calls.filter(([sql]) => sql.includes(ARCHIVE_SQL));
    expect(archiveCalls).toHaveLength(1);
    expect(archiveCalls[0][0]).toContain("expired_at IS NOT NULL");
    expect(archiveCalls[0][0]).toContain("archived_at IS NULL");
    expect(archiveCalls[0][0]).not.toContain("DELETE");
  });
});
