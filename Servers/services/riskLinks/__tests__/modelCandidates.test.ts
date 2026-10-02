import { notifyModelRiskCandidates } from "../modelCandidates";
import { getModelRiskCandidatesQuery } from "../../../utils/riskLink.utils";
import { notifyRiskOfModelCandidates } from "../../inAppNotification.service";
import {
  getAnnouncedModelRiskIdsQuery,
  hasModelRiskCandidateNoticeQuery,
} from "../../../utils/notification.utils";

jest.mock("../../../utils/riskLink.utils", () => ({
  getModelRiskCandidatesQuery: jest.fn(),
}));
jest.mock("../../inAppNotification.service", () => ({
  notifyRiskOfModelCandidates: jest.fn(),
}));
jest.mock("../../../utils/notification.utils", () => ({
  hasModelRiskCandidateNoticeQuery: jest.fn(),
  getAnnouncedModelRiskIdsQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockQuery = getModelRiskCandidatesQuery as jest.Mock;
const mockNotify = notifyRiskOfModelCandidates as jest.Mock;
const mockAlreadyNotified = hasModelRiskCandidateNoticeQuery as jest.Mock;
const mockAnnounced = getAnnouncedModelRiskIdsQuery as jest.Mock;

const input = {
  organizationId: 1,
  modelInventoryId: 11,
  modelName: "Lending scorecard",
  projectIds: [21],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNotify.mockResolvedValue(true);
  mockAlreadyNotified.mockResolvedValue(false);
  mockAnnounced.mockResolvedValue([]);
});

describe("notifyModelRiskCandidates", () => {
  it("sends nothing on an empty candidate list", async () => {
    mockQuery.mockResolvedValue([]);

    const summary = await notifyModelRiskCandidates(input);

    expect(summary).toEqual({
      organization_id: 1,
      model_inventory_id: 11,
      risks: 0,
      candidates: 0,
      notified: 0,
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("notifies two risks and sums candidate_count", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 2 },
      { risk_id: 32, risk_name: "Risk B", risk_owner: 6, candidate_count: 3 },
    ]);

    const summary = await notifyModelRiskCandidates(input);

    expect(summary).toEqual({
      organization_id: 1,
      model_inventory_id: 11,
      risks: 2,
      candidates: 5,
      notified: 2,
    });
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      { id: 31, risk_name: "Risk A", risk_owner: 5 },
      { id: 11, name: "Lending scorecard" },
      2,
      [],
    );
  });

  it("counts an ownerless risk but does not notify it", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: null, candidate_count: 4 },
    ]);

    const summary = await notifyModelRiskCandidates(input);

    expect(summary).toEqual({
      organization_id: 1,
      model_inventory_id: 11,
      risks: 1,
      candidates: 4,
      notified: 0,
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("skips a risk already notified about this model", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 2 },
    ]);
    mockAlreadyNotified.mockResolvedValue(true);

    const summary = await notifyModelRiskCandidates(input);

    expect(summary.notified).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockAlreadyNotified).toHaveBeenCalledWith(1, 5, 31, 11);
  });

  it("re-notifies for a new model risk despite a prior model-level notice", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 1 },
    ]);
    mockAlreadyNotified.mockResolvedValue(true);
    mockAnnounced.mockResolvedValue([]);

    const summary = await notifyModelRiskCandidates({ ...input, modelRiskIds: [99] });

    expect(summary.notified).toBe(1);
    expect(mockAlreadyNotified).not.toHaveBeenCalled();
    expect(mockAnnounced).toHaveBeenCalledWith(1, 5, 31, 11);
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      { id: 31, risk_name: "Risk A", risk_owner: 5 },
      { id: 11, name: "Lending scorecard" },
      1,
      [99],
    );
  });

  it("skips model risks already announced for this risk", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 1 },
    ]);
    mockAnnounced.mockResolvedValue([99]);

    const summary = await notifyModelRiskCandidates({ ...input, modelRiskIds: [99] });

    expect(summary.notified).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("announces only the unannounced subset of a multi-id trigger", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 2 },
    ]);
    mockAnnounced.mockResolvedValue([99]);

    const summary = await notifyModelRiskCandidates({ ...input, modelRiskIds: [99, 100] });

    expect(summary.notified).toBe(1);
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      { id: 31, risk_name: "Risk A", risk_owner: 5 },
      { id: 11, name: "Lending scorecard" },
      2,
      [100],
    );
  });

  it("one rejecting notifier does not abort the other", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 1 },
      { risk_id: 32, risk_name: "Risk B", risk_owner: 6, candidate_count: 1 },
    ]);
    mockNotify.mockImplementation(async (_org: number, risk: { id: number }) => {
      if (risk.id === 31) throw new Error("delivery boom");
      return true;
    });

    const summary = await notifyModelRiskCandidates(input);

    expect(summary.notified).toBe(1);
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  it("returns the zero summary without calling the query when projectIds is empty", async () => {
    const summary = await notifyModelRiskCandidates({ ...input, projectIds: [] });

    expect(summary).toEqual({
      organization_id: 1,
      model_inventory_id: 11,
      risks: 0,
      candidates: 0,
      notified: 0,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
