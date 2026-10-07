import { MAX_VENDOR_CANDIDATE_NOTICES, notifyVendorRiskCandidates } from "../vendorCandidates";
import { getVendorRiskCandidatesQuery } from "../../../utils/riskLink.utils";
import { notifyRiskOfVendorCandidates } from "../../inAppNotification.service";
import {
  getAnnouncedVendorRiskIdsQuery,
  hasVendorRiskCandidateNoticeQuery,
} from "../../../utils/notification.utils";

jest.mock("../../../utils/riskLink.utils", () => ({
  getVendorRiskCandidatesQuery: jest.fn(),
}));
jest.mock("../../inAppNotification.service", () => ({
  notifyRiskOfVendorCandidates: jest.fn(),
}));
jest.mock("../../../utils/notification.utils", () => ({
  hasVendorRiskCandidateNoticeQuery: jest.fn(),
  getAnnouncedVendorRiskIdsQuery: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockQuery = getVendorRiskCandidatesQuery as jest.Mock;
const mockNotify = notifyRiskOfVendorCandidates as jest.Mock;
const mockAlreadyNotified = hasVendorRiskCandidateNoticeQuery as jest.Mock;
const mockAnnounced = getAnnouncedVendorRiskIdsQuery as jest.Mock;

const input = {
  organizationId: 1,
  vendorId: 11,
  vendorName: "Acme Cloud",
  projectIds: [21],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNotify.mockResolvedValue(true);
  mockAlreadyNotified.mockResolvedValue(false);
  mockAnnounced.mockResolvedValue([]);
});

describe("notifyVendorRiskCandidates", () => {
  it("sends nothing on an empty candidate list", async () => {
    mockQuery.mockResolvedValue([]);

    const summary = await notifyVendorRiskCandidates(input);

    expect(summary).toEqual({
      organization_id: 1,
      vendor_id: 11,
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

    const summary = await notifyVendorRiskCandidates(input);

    expect(summary).toEqual({
      organization_id: 1,
      vendor_id: 11,
      risks: 2,
      candidates: 5,
      notified: 2,
    });
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      { id: 31, risk_name: "Risk A", risk_owner: 5 },
      { id: 11, name: "Acme Cloud" },
      2,
      [],
    );
  });

  it("counts an ownerless risk but does not notify it", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: null, candidate_count: 4 },
    ]);

    const summary = await notifyVendorRiskCandidates(input);

    expect(summary).toEqual({
      organization_id: 1,
      vendor_id: 11,
      risks: 1,
      candidates: 4,
      notified: 0,
    });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("skips a risk already notified about this vendor", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 2 },
    ]);
    mockAlreadyNotified.mockResolvedValue(true);

    const summary = await notifyVendorRiskCandidates(input);

    expect(summary.notified).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockAlreadyNotified).toHaveBeenCalledWith(1, 5, 31, 11);
  });

  it("re-notifies for a new vendor risk despite a prior vendor-level notice", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 1 },
    ]);
    mockAlreadyNotified.mockResolvedValue(true);
    mockAnnounced.mockResolvedValue([]);

    const summary = await notifyVendorRiskCandidates({ ...input, vendorRiskIds: [99] });

    expect(summary.notified).toBe(1);
    expect(mockAlreadyNotified).not.toHaveBeenCalled();
    expect(mockAnnounced).toHaveBeenCalledWith(1, 5, 31, 11);
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      { id: 31, risk_name: "Risk A", risk_owner: 5 },
      { id: 11, name: "Acme Cloud" },
      1,
      [99],
    );
  });

  it("skips vendor risks already announced for this risk", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 1 },
    ]);
    mockAnnounced.mockResolvedValue([99]);

    const summary = await notifyVendorRiskCandidates({ ...input, vendorRiskIds: [99] });

    expect(summary.notified).toBe(0);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("announces only the unannounced subset of a multi-id trigger", async () => {
    mockQuery.mockResolvedValue([
      { risk_id: 31, risk_name: "Risk A", risk_owner: 5, candidate_count: 2 },
    ]);
    mockAnnounced.mockResolvedValue([99]);

    const summary = await notifyVendorRiskCandidates({ ...input, vendorRiskIds: [99, 100] });

    expect(summary.notified).toBe(1);
    expect(mockNotify).toHaveBeenCalledWith(
      1,
      { id: 31, risk_name: "Risk A", risk_owner: 5 },
      { id: 11, name: "Acme Cloud" },
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

    const summary = await notifyVendorRiskCandidates(input);

    expect(summary.notified).toBe(1);
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  it("returns the zero summary without calling the query when projectIds is empty", async () => {
    const summary = await notifyVendorRiskCandidates({ ...input, projectIds: [] });

    expect(summary).toEqual({
      organization_id: 1,
      vendor_id: 11,
      risks: 0,
      candidates: 0,
      notified: 0,
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("asks for the vendor's candidates in its use cases, capped, scoped to the trigger", async () => {
    mockQuery.mockResolvedValue([]);

    await notifyVendorRiskCandidates({ ...input, vendorRiskIds: [99] });

    expect(mockQuery).toHaveBeenCalledWith({
      organizationId: 1,
      vendorId: 11,
      projectIds: [21],
      vendorRiskIds: [99],
      limit: MAX_VENDOR_CANDIDATE_NOTICES,
    });
  });
});
