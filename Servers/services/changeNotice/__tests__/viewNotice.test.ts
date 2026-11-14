import { viewNotice } from "../index";
import * as utils from "../../../utils/changeNotice.utils";

jest.mock("../../../utils/changeNotice.utils");

const mocked = utils as jest.Mocked<typeof utils>;
const input = { userId: 1, organizationId: 2, id: "ai-detection", now: new Date("2026-11-14") };

const freshContext = {
  state: undefined,
  accountCreatedAt: new Date("2026-01-01"),
  orgFirstSeenAt: null,
  keyCount: 0,
};

describe("viewNotice", () => {
  beforeEach(() => jest.resetAllMocks());

  it("shows when the visit was recorded", async () => {
    mocked.getNoticeContextQuery.mockResolvedValue(freshContext);
    mocked.recordViewQuery.mockResolvedValue(true);
    expect(await viewNotice(input)).toEqual({ show: true });
  });

  it("does not show when the write was refused (key cap hit under the row lock)", async () => {
    mocked.getNoticeContextQuery.mockResolvedValue(freshContext);
    mocked.recordViewQuery.mockResolvedValue(false);
    expect(await viewNotice(input)).toEqual({ show: false });
  });

  it("writes nothing when the rules refuse", async () => {
    mocked.getNoticeContextQuery.mockResolvedValue({
      ...freshContext,
      state: { first_seen_at: "2026-11-01T00:00:00Z", views: 3, dismissed_at: null },
    });
    expect(await viewNotice(input)).toEqual({ show: false });
    expect(mocked.recordViewQuery).not.toHaveBeenCalled();
  });
});
