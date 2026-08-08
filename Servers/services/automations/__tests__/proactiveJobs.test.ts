/**
 * @fileoverview Proactive scheduled job handler tests (Phase 4 / issue 3811)
 *
 * Tests for the per-org proactive cron handlers wired into the automation
 * worker: handleRiskAnomalyJob, handleComplianceScoreJob,
 * handleTaskOverdueJob, handleWeeklyDigestJob. Each handler iterates all
 * organizations and calls notifyProactive when the corresponding detection
 * is positive. The detection utils, proactiveNotify and the organization
 * query are mocked so no DB/network is touched.
 *
 * @module tests/proactiveJobs
 */

jest.mock("../../../utils/proactiveDetection.utils", () => ({
  detectRiskAnomaly: jest.fn(),
  findOverdueTasks: jest.fn(),
  detectComplianceDrop: jest.fn(),
  buildWeeklyDigest: jest.fn(),
}));

jest.mock("../../proactiveNotify", () => ({
  notifyProactive: jest.fn(),
}));

jest.mock("../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));

// Worker module pulls in many side-effectful deps at import time; stub the
// ones that touch Redis / HTTP / fs so the handlers can be imported in isolation.
jest.mock("../automationProducer", () => ({
  automationQueue: { add: jest.fn(), obliterate: jest.fn() },
  enqueueAutomationAction: jest.fn(),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  logStructured: jest.fn(),
  __esModule: true,
}));

import {
  handleRiskAnomalyJob,
  handleComplianceScoreJob,
  handleTaskOverdueJob,
  handleWeeklyDigestJob,
} from "../automationWorker";
import {
  detectRiskAnomaly,
  findOverdueTasks,
  detectComplianceDrop,
  buildWeeklyDigest,
} from "../../../utils/proactiveDetection.utils";
import { notifyProactive } from "../../proactiveNotify";
import { getAllOrganizationsQuery } from "../../../utils/organization.utils";

const mockDetectRiskAnomaly = detectRiskAnomaly as jest.MockedFunction<typeof detectRiskAnomaly>;
const mockFindOverdueTasks = findOverdueTasks as jest.MockedFunction<typeof findOverdueTasks>;
const mockDetectComplianceDrop = detectComplianceDrop as jest.MockedFunction<
  typeof detectComplianceDrop
>;
const mockBuildWeeklyDigest = buildWeeklyDigest as jest.MockedFunction<typeof buildWeeklyDigest>;
const mockNotifyProactive = notifyProactive as jest.MockedFunction<typeof notifyProactive>;
const mockGetAllOrganizations = getAllOrganizationsQuery as jest.MockedFunction<
  typeof getAllOrganizationsQuery
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllOrganizations.mockResolvedValue([{ id: 1 }, { id: 2 }] as any);
  mockNotifyProactive.mockResolvedValue(undefined);
});

describe("handleRiskAnomalyJob", () => {
  it("notifies (inApp+teams) for each org that has an anomaly, iterating all orgs", async () => {
    mockDetectRiskAnomaly.mockResolvedValue({
      isAnomaly: true,
      count24h: 5,
      avg30d: 1,
      ratio: 5,
    });

    await handleRiskAnomalyJob();

    expect(mockGetAllOrganizations).toHaveBeenCalledTimes(1);
    expect(mockDetectRiskAnomaly).toHaveBeenCalledTimes(2);
    expect(mockDetectRiskAnomaly).toHaveBeenCalledWith(1);
    expect(mockDetectRiskAnomaly).toHaveBeenCalledWith(2);
    expect(mockNotifyProactive).toHaveBeenCalledTimes(2);
    const [orgId, payload] = mockNotifyProactive.mock.calls[0];
    expect(orgId).toBe(1);
    expect(payload.channels).toEqual(
      expect.objectContaining({ inApp: true, teams: expect.anything() }),
    );
  });

  it("does NOT notify when there is no anomaly", async () => {
    mockDetectRiskAnomaly.mockResolvedValue({
      isAnomaly: false,
      count24h: 0,
      avg30d: 1,
      ratio: 0,
    });

    await handleRiskAnomalyJob();

    expect(mockDetectRiskAnomaly).toHaveBeenCalledTimes(2);
    expect(mockNotifyProactive).not.toHaveBeenCalled();
  });
});

describe("handleComplianceScoreJob", () => {
  it("notifies (slack+teams) per org when a compliance drop is detected", async () => {
    mockDetectComplianceDrop.mockResolvedValue([
      { framework_type: "ISO 42001", latest_score: 70, previous_score: 80, drop: 10 },
    ]);

    await handleComplianceScoreJob();

    expect(mockGetAllOrganizations).toHaveBeenCalledTimes(1);
    expect(mockDetectComplianceDrop).toHaveBeenCalledTimes(2);
    expect(mockNotifyProactive).toHaveBeenCalledTimes(2);
    const [, payload] = mockNotifyProactive.mock.calls[0];
    expect(payload.channels).toEqual(
      expect.objectContaining({ slack: expect.anything(), teams: expect.anything() }),
    );
  });

  it("does NOT notify when no framework dropped", async () => {
    mockDetectComplianceDrop.mockResolvedValue([]);

    await handleComplianceScoreJob();

    expect(mockNotifyProactive).not.toHaveBeenCalled();
  });
});

describe("handleTaskOverdueJob", () => {
  it("notifies (slack+teams) per org when overdue tasks exist", async () => {
    mockFindOverdueTasks.mockResolvedValue([{ id: 11 }, { id: 12 }]);

    await handleTaskOverdueJob();

    expect(mockGetAllOrganizations).toHaveBeenCalledTimes(1);
    expect(mockFindOverdueTasks).toHaveBeenCalledTimes(2);
    expect(mockNotifyProactive).toHaveBeenCalledTimes(2);
    const [, payload] = mockNotifyProactive.mock.calls[0];
    expect(payload.channels).toEqual(
      expect.objectContaining({ slack: expect.anything(), teams: expect.anything() }),
    );
  });

  it("does NOT notify when there are no overdue tasks", async () => {
    mockFindOverdueTasks.mockResolvedValue([]);

    await handleTaskOverdueJob();

    expect(mockNotifyProactive).not.toHaveBeenCalled();
  });
});

describe("handleWeeklyDigestJob", () => {
  it("notifies (inApp+email+slack+teams) for every org", async () => {
    mockBuildWeeklyDigest.mockResolvedValue({
      openRisks: 3,
      overdueTasks: [],
      frameworkScores: [],
      generatedAt: "2026-05-31T00:00:00.000Z",
    });

    await handleWeeklyDigestJob();

    expect(mockGetAllOrganizations).toHaveBeenCalledTimes(1);
    expect(mockBuildWeeklyDigest).toHaveBeenCalledTimes(2);
    expect(mockNotifyProactive).toHaveBeenCalledTimes(2);
    const [, payload] = mockNotifyProactive.mock.calls[0];
    expect(payload.channels).toEqual(
      expect.objectContaining({
        inApp: true,
        email: expect.anything(),
        slack: expect.anything(),
        teams: expect.anything(),
      }),
    );
  });
});
