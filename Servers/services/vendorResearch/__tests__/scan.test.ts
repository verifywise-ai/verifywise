jest.mock("../../../utils/vendorResearch.utils", () => ({
  countRunsSinceQuery: jest.fn(),
  listDueVendorsQuery: jest.fn(),
  listScanOrganizationsQuery: jest.fn(),
}));
jest.mock("../trigger", () => ({ startVendorResearch: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import logger from "../../../utils/logger/fileLogger";
import {
  countRunsSinceQuery,
  listDueVendorsQuery,
  listScanOrganizationsQuery,
} from "../../../utils/vendorResearch.utils";
import { SCAN_BATCH_SIZE, runVendorResearchScan } from "../scan";
import { startVendorResearch } from "../trigger";

type AnyMock = jest.Mock<any, any[]>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

const NOW = new Date("2031-04-20T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const started = (id: number) => ({ ok: true, run: { id }, alreadyRunning: false });
const refused = (code: string) => ({ ok: false, error: { code } });

/** The calls to startVendorResearch as [organization, vendor, trigger, requestedBy]. */
const startsMade = () =>
  asMock(startVendorResearch).mock.calls.map(([args]) => [
    args.organizationId,
    args.vendorId,
    args.triggerType,
    args.requestedBy,
  ]);

const scan = () => runVendorResearchScan({ now: () => NOW });

const loggedText = () =>
  Object.values(logger as unknown as Record<string, AnyMock>)
    .flatMap((method) => method.mock.calls)
    .map((args) => args.map(String).join(" "))
    .join("\n");

beforeEach(() => {
  jest.resetAllMocks();
  delete process.env.VENDOR_RESEARCH_DAILY_RUN_CAP;
  asMock(listScanOrganizationsQuery).mockResolvedValue([{ organizationId: 3, intervalDays: 14 }]);
  asMock(countRunsSinceQuery).mockResolvedValue(0);
  asMock(listDueVendorsQuery).mockResolvedValue([7, 8, 9]);
  let runId = 100;
  asMock(startVendorResearch).mockImplementation(async () => started((runId += 1)));
});

afterAll(() => {
  delete process.env.VENDOR_RESEARCH_DAILY_RUN_CAP;
});

describe("runVendorResearchScan", () => {
  it("starts a scheduled run, started by nobody, for each vendor that is due in an organization that chose an interval", async () => {
    const summary = await scan();

    expect(startsMade()).toEqual([
      [3, 7, "scheduled", null],
      [3, 8, "scheduled", null],
      [3, 9, "scheduled", null],
    ]);
    expect(summary).toEqual({ organizations: 1, started: 3 });
  });

  it("asks for the vendors that are due with the interval of the organization", async () => {
    await scan();

    expect(listDueVendorsQuery).toHaveBeenCalledTimes(1);
    expect(listDueVendorsQuery).toHaveBeenCalledWith({
      organizationId: 3,
      intervalDays: 14,
      limit: SCAN_BATCH_SIZE,
    });
  });

  it("does nothing when no organization chose an interval", async () => {
    asMock(listScanOrganizationsQuery).mockResolvedValue([]);

    await expect(scan()).resolves.toEqual({ organizations: 0, started: 0 });

    expect(listDueVendorsQuery).not.toHaveBeenCalled();
    expect(startVendorResearch).not.toHaveBeenCalled();
  });

  it("goes through the organizations one by one, each with its own interval", async () => {
    asMock(listScanOrganizationsQuery).mockResolvedValue([
      { organizationId: 3, intervalDays: 7 },
      { organizationId: 4, intervalDays: 30 },
    ]);
    asMock(listDueVendorsQuery).mockImplementation(async ({ organizationId }) =>
      organizationId === 3 ? [7] : [21, 22],
    );

    const summary = await scan();

    expect(
      asMock(listDueVendorsQuery).mock.calls.map(([input]) => [
        input.organizationId,
        input.intervalDays,
      ]),
    ).toEqual([
      [3, 7],
      [4, 30],
    ]);
    expect(startsMade()).toEqual([
      [3, 7, "scheduled", null],
      [4, 21, "scheduled", null],
      [4, 22, "scheduled", null],
    ]);
    expect(summary).toEqual({ organizations: 2, started: 3 });
  });

  describe("how many runs it starts", () => {
    it("starts a few at a time, so that the runs of a register are spread over the day", async () => {
      expect(SCAN_BATCH_SIZE).toBe(5);
      asMock(listDueVendorsQuery).mockImplementation(async ({ limit }) =>
        Array.from({ length: limit }, (_, index) => index + 1),
      );

      const summary = await scan();

      expect(summary.started).toBe(5);
    });

    // A person must always be able to start a run by hand, and the scan is the lowest priority.
    it("counts the runs of the last 24 hours of the organization, whoever started them", async () => {
      await scan();

      expect(countRunsSinceQuery).toHaveBeenCalledTimes(1);
      expect(countRunsSinceQuery).toHaveBeenCalledWith(3, new Date(NOW.getTime() - DAY_MS));
    });

    it("uses at most half of the daily cap of the organization, 25 runs with the default of 50", async () => {
      asMock(countRunsSinceQuery).mockResolvedValue(22);

      await scan();

      expect(asMock(listDueVendorsQuery).mock.calls[0][0].limit).toBe(3);
    });

    it("starts none once half of the cap is used, and does not even ask which vendors are due", async () => {
      asMock(countRunsSinceQuery).mockResolvedValue(25);

      await expect(scan()).resolves.toEqual({ organizations: 1, started: 0 });

      expect(listDueVendorsQuery).not.toHaveBeenCalled();
      expect(startVendorResearch).not.toHaveBeenCalled();
    });

    it("reads the cap from the environment of the process, as a start does", async () => {
      process.env.VENDOR_RESEARCH_DAILY_RUN_CAP = "12";
      asMock(countRunsSinceQuery).mockResolvedValue(4);

      await scan();

      // Half of 12 is 6, and 4 are used.
      expect(asMock(listDueVendorsQuery).mock.calls[0][0].limit).toBe(2);
    });

    it("starts none for a cap of 1, whose only run is not the scan's to take", async () => {
      process.env.VENDOR_RESEARCH_DAILY_RUN_CAP = "1";

      await expect(scan()).resolves.toEqual({ organizations: 1, started: 0 });

      expect(startVendorResearch).not.toHaveBeenCalled();
    });

    it("counts the runs of each organization on its own", async () => {
      asMock(listScanOrganizationsQuery).mockResolvedValue([
        { organizationId: 3, intervalDays: 7 },
        { organizationId: 4, intervalDays: 7 },
      ]);
      asMock(countRunsSinceQuery).mockImplementation(async (organizationId: number) =>
        organizationId === 3 ? 25 : 0,
      );

      const summary = await scan();

      expect(asMock(listDueVendorsQuery).mock.calls.map(([input]) => input.organizationId)).toEqual(
        [4],
      );
      expect(summary).toEqual({ organizations: 2, started: 3 });
    });
  });

  describe("what a start can answer", () => {
    it("does not count a vendor that already has a run on its way", async () => {
      asMock(startVendorResearch)
        .mockResolvedValueOnce(started(101))
        .mockResolvedValueOnce({ ok: true, run: { id: 50 }, alreadyRunning: true })
        .mockResolvedValueOnce(started(102));

      const summary = await scan();

      expect(summary).toEqual({ organizations: 1, started: 2 });
      expect(startVendorResearch).toHaveBeenCalledTimes(3);
    });

    it.each(["vendor_not_found", "cooldown"])(
      "goes on to the next vendor when a start answers %s",
      async (code) => {
        asMock(startVendorResearch)
          .mockResolvedValueOnce(refused(code))
          .mockResolvedValueOnce(started(101))
          .mockResolvedValueOnce(started(102));

        const summary = await scan();

        expect(summary).toEqual({ organizations: 1, started: 2 });
        expect(startVendorResearch).toHaveBeenCalledTimes(3);
      },
    );

    it.each(["llm_key_missing", "daily_cap", "enqueue_failed"])(
      "leaves the organization for this scan when a start answers %s, since the next vendor would meet the same",
      async (code) => {
        asMock(listScanOrganizationsQuery).mockResolvedValue([
          { organizationId: 3, intervalDays: 7 },
          { organizationId: 4, intervalDays: 7 },
        ]);
        asMock(listDueVendorsQuery).mockImplementation(async ({ organizationId }) =>
          organizationId === 3 ? [7, 8, 9] : [21],
        );
        asMock(startVendorResearch).mockImplementation(async ({ organizationId }) =>
          organizationId === 3 ? refused(code) : started(200),
        );

        const summary = await scan();

        expect(startsMade()).toEqual([
          [3, 7, "scheduled", null],
          [4, 21, "scheduled", null],
        ]);
        expect(summary).toEqual({ organizations: 2, started: 1 });
      },
    );
  });

  describe("a failure", () => {
    const failure = Object.assign(new Error("connect ECONNREFUSED db.internal:5432"), {
      name: "SequelizeConnectionError",
    });

    it("of one organization is logged by the name of the error, and the other organizations are scanned", async () => {
      asMock(listScanOrganizationsQuery).mockResolvedValue([
        { organizationId: 3, intervalDays: 7 },
        { organizationId: 4, intervalDays: 7 },
      ]);
      asMock(countRunsSinceQuery).mockImplementation(async (organizationId: number) => {
        if (organizationId === 3) throw failure;
        return 0;
      });

      const summary = await scan();

      expect(startsMade().map(([organizationId]) => organizationId)).toEqual([4, 4, 4]);
      expect(summary).toEqual({ organizations: 2, started: 3 });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("organization 3"));
      expect(loggedText()).toContain("SequelizeConnectionError");
      expect(loggedText()).not.toContain("db.internal");
    });

    it("of a start leaves the organization for this scan, and is logged by name", async () => {
      asMock(startVendorResearch).mockRejectedValueOnce(failure);

      const summary = await scan();

      expect(startVendorResearch).toHaveBeenCalledTimes(1);
      expect(summary).toEqual({ organizations: 1, started: 0 });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("organization 3"));
      expect(loggedText()).not.toContain("db.internal");
    });

    it("of a start halfway through still counts the runs that did start", async () => {
      asMock(startVendorResearch)
        .mockResolvedValueOnce(started(101))
        .mockResolvedValueOnce(started(102))
        .mockRejectedValueOnce(failure);

      const summary = await scan();

      expect(summary).toEqual({ organizations: 1, started: 2 });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("2 runs"));
    });

    it("to find the organizations is not caught, so that the job fails and the next scan tries again", async () => {
      asMock(listScanOrganizationsQuery).mockRejectedValue(failure);

      await expect(scan()).rejects.toBe(failure);
    });
  });

  describe("what it logs", () => {
    it("says how many runs it started, with ids and counts only", async () => {
      await scan();

      expect(logger.info).toHaveBeenCalledTimes(1);
      const [line] = asMock(logger.info).mock.calls[0];
      expect(line).toContain("3 runs");
      expect(line).toContain("1 organization");
    });

    it("keeps quiet above debug level when it started nothing, since it runs every hour", async () => {
      asMock(listDueVendorsQuery).mockResolvedValue([]);

      await scan();

      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  it("uses the clock of the process when it is not given one", async () => {
    await runVendorResearchScan();

    const since = asMock(countRunsSinceQuery).mock.calls[0][1] as Date;
    expect(Math.abs(Date.now() - DAY_MS - since.getTime())).toBeLessThan(5_000);
  });
});
