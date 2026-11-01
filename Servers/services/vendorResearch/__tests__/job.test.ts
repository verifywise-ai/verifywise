jest.mock("../pipeline", () => ({ runVendorResearch: jest.fn(), resolveOrgModel: jest.fn() }));
jest.mock("../researchAgent", () => ({ createVendorResearcher: jest.fn() }));
jest.mock("../researchCache", () => ({ sharedWebCache: jest.fn() }));
jest.mock("../pageRenderer", () => ({ sharedPageRenderer: jest.fn() }));
jest.mock("../records", () => ({ sharedRecordsLookup: jest.fn() }));
jest.mock("../vrdb/lookup", () => ({ sharedVrdbLookup: jest.fn() }));
// Replaced only to show that the job no longer reads it.
jest.mock("../config", () => ({ getVendorResearchConfig: jest.fn() }));
jest.mock("../../../advisor/llmSelfCorrect", () => ({
  generateObjectWithSelfCorrection: jest.fn(),
}));
jest.mock("../../../utils/vendor.utils", () => ({ getVendorByIdQuery: jest.fn() }));
jest.mock("../../../utils/user.utils", () => ({ findUsersNotInOrganization: jest.fn() }));
jest.mock("../../../utils/vendorResearch.utils", () => ({
  finishRunQuery: jest.fn(),
  getRunByIdQuery: jest.fn(),
}));
jest.mock("../../inAppNotification.service", () => ({ notifyAssigneeOfVendorResearch: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { generateObjectWithSelfCorrection } from "../../../advisor/llmSelfCorrect";
import { IVendor } from "../../../domain.layer/interfaces/i.vendor";
import { IVendorResearchRun } from "../../../domain.layer/interfaces/i.vendorResearch";
import logger from "../../../utils/logger/fileLogger";
import { findUsersNotInOrganization } from "../../../utils/user.utils";
import { getVendorByIdQuery } from "../../../utils/vendor.utils";
import { finishRunQuery, getRunByIdQuery } from "../../../utils/vendorResearch.utils";
import { notifyAssigneeOfVendorResearch } from "../../inAppNotification.service";
import { getVendorResearchConfig } from "../config";
import { handleVendorResearchJob } from "../job";
import { PipelineDeps, resolveOrgModel, runVendorResearch } from "../pipeline";
import { VendorResearcher, createVendorResearcher } from "../researchAgent";
import { sharedPageRenderer } from "../pageRenderer";
import { sharedRecordsLookup } from "../records";
import { sharedWebCache } from "../researchCache";
import { sharedVrdbLookup } from "../vrdb/lookup";

type AnyMock = jest.Mock<any, any[]>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

// Three different numbers, so that a swapped pair of arguments shows up as a failure.
const ORG = 3;
const VENDOR = 7;
const RUN_ID = 11;
const ASSIGNEE = 5;
const DATA = { organizationId: ORG, vendorId: VENDOR, runId: RUN_ID };

/** The researcher the job is given: a stand-in, since the pipeline that would call it is too. */
const RESEARCHER: VendorResearcher = jest.fn();
/** The cache of the process: a stand-in, so that no test opens a connection. */
const CACHE = { get: jest.fn(), set: jest.fn() };
/** The headless browser of the process: a stand-in, so that no test starts one. */
const RENDERER = jest.fn();
/** The lookup of the vendor risk database for the run's vendor: a stand-in, so that no test reaches it. */
const VRDB = jest.fn();

const makeRun = (overrides: Partial<IVendorResearchRun> = {}): IVendorResearchRun => ({
  id: RUN_ID,
  organization_id: ORG,
  vendor_id: VENDOR,
  trigger_type: "auto",
  status: "queued",
  categories: [],
  category_summary: [],
  evidence: null,
  model: null,
  prompt_version: null,
  searches_used: 0,
  pages_read: 0,
  duplicates_dropped: 0,
  error: null,
  progress: null,
  requested_by: null,
  coverage: null,
  registry_version: null,
  created_at: new Date("2031-04-20T12:00:00Z"),
  started_at: null,
  finished_at: null,
  ...overrides,
});

const makeVendor = (overrides: Partial<IVendor> = {}): IVendor =>
  ({ id: VENDOR, vendor_name: "Acme", assignee: ASSIGNEE, ...overrides }) as IVendor;

beforeEach(() => {
  jest.resetAllMocks();
  asMock(createVendorResearcher).mockReturnValue(RESEARCHER);
  asMock(sharedWebCache).mockReturnValue(CACHE);
  asMock(sharedVrdbLookup).mockReturnValue(VRDB);
  asMock(getRunByIdQuery).mockResolvedValue(makeRun());
  asMock(getVendorByIdQuery).mockResolvedValue(makeVendor());
  // The assignee is a user of the organization: the lookup reports nobody missing.
  asMock(findUsersNotInOrganization).mockResolvedValue([]);
  asMock(runVendorResearch).mockResolvedValue({ outcome: "completed", findingsCreated: 2 });
  asMock(notifyAssigneeOfVendorResearch).mockResolvedValue(true);
  asMock(finishRunQuery).mockResolvedValue(undefined);
});

describe("handleVendorResearchJob", () => {
  it("drops a job whose run is not there (it was deleted with its vendor), without an error", async () => {
    asMock(getRunByIdQuery).mockResolvedValue(null);

    await expect(handleVendorResearchJob(DATA)).resolves.toBeUndefined();

    expect(runVendorResearch).not.toHaveBeenCalled();
    expect(finishRunQuery).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(`run ${RUN_ID}`));
  });

  it("runs the pipeline for the run, with the vendor researcher and the real model, generator and clock", async () => {
    await handleVendorResearchJob(DATA);

    expect(runVendorResearch).toHaveBeenCalledTimes(1);
    const [args, deps] = asMock(runVendorResearch).mock.calls[0] as [typeof DATA, PipelineDeps];
    expect(args).toEqual({ ...DATA, triggerType: "auto" });
    // The real researcher, with its real page reader and generator, on the cache that all the runs
    // of the process share. It has no engine: each run builds its own from the key it researches with.
    expect(createVendorResearcher).toHaveBeenCalledTimes(1);
    expect(createVendorResearcher).toHaveBeenCalledWith({
      cache: CACHE,
      gather: true,
      perCategory: true,
      vrdb: VRDB,
    });
    expect(deps.research).toBe(RESEARCHER);
    expect(deps.resolveModel).toBe(resolveOrgModel);
    expect(deps.generate).toBe(generateObjectWithSelfCorrection);
    // The findings that stay are checked by the verifier before they are stored.
    expect(deps.verifier).toBe(true);
    const before = Date.now();
    const now = deps.now();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("gives the researcher no search engine, so that each run searches as the key of its organization says", async () => {
    await handleVendorResearchJob(DATA);

    // An engine given here would be the engine of every run, whatever the key it researches with:
    // the researcher builds the engine of a run from the search that the pipeline hands over.
    expect(asMock(createVendorResearcher).mock.calls[0][0]).not.toHaveProperty("engine");
  });

  // A scheduled run analyses only the sources that earlier runs did not show to the model: the
  // pipeline needs to know that the run is one.
  it.each(["auto", "manual", "scheduled"] as const)(
    "tells the pipeline that the run is %s",
    async (trigger) => {
      asMock(getRunByIdQuery).mockResolvedValue(makeRun({ trigger_type: trigger }));

      await handleVendorResearchJob(DATA);

      expect(asMock(runVendorResearch).mock.calls[0][0]).toEqual({ ...DATA, triggerType: trigger });
    },
  );

  it("gives the researcher the headless browser of the process when there is one", async () => {
    asMock(sharedPageRenderer).mockReturnValue(RENDERER);

    await handleVendorResearchJob(DATA);

    expect(createVendorResearcher).toHaveBeenCalledTimes(1);
    expect(createVendorResearcher).toHaveBeenCalledWith({
      cache: CACHE,
      render: RENDERER,
      records: undefined,
      gather: true,
      perCategory: true,
      vrdb: VRDB,
    });
  });

  it("gives the researcher the lookup in the public databases of the process when there is one", async () => {
    const lookup = jest.fn();
    asMock(sharedRecordsLookup).mockReturnValue(lookup);

    await handleVendorResearchJob(DATA);

    expect(asMock(createVendorResearcher).mock.calls[0][0].records).toBe(lookup);
  });

  it("gives it none when an operator turned the records off", async () => {
    asMock(sharedRecordsLookup).mockReturnValue(undefined);

    await handleVendorResearchJob(DATA);

    expect(asMock(createVendorResearcher).mock.calls[0][0].records).toBeUndefined();
  });

  describe("the vendor risk database", () => {
    it("is always the researcher's: it gets the vendor's lookup in it beside the lookup of the process, and the pipeline and the researcher get no rules", async () => {
      const vrdb = jest.fn();
      const records = jest.fn();
      asMock(sharedVrdbLookup).mockReturnValue(vrdb);
      asMock(sharedRecordsLookup).mockReturnValue(records);

      await handleVendorResearchJob(DATA);

      expect(sharedVrdbLookup).toHaveBeenCalledWith({ organizationId: ORG, vendorId: VENDOR });
      const researcherDeps = asMock(createVendorResearcher).mock.calls[0][0];
      // The lookup of the process then asks only what the VRDB does not keep (records/).
      expect(researcherDeps).toMatchObject({ vrdb, records });
      // There is one set of rules, the credibility rules, so there is nothing to pass.
      expect(researcherDeps).not.toHaveProperty("rules");
      const [, deps] = asMock(runVendorResearch).mock.calls[0] as [typeof DATA, PipelineDeps];
      expect(deps).not.toHaveProperty("rules");
    });

    it("asks for the lookup of the run's own vendor and organization, once for each job", async () => {
      await handleVendorResearchJob({ organizationId: 8, vendorId: 9, runId: RUN_ID });
      asMock(getRunByIdQuery).mockResolvedValue(makeRun({ organization_id: 4, vendor_id: 5 }));
      await handleVendorResearchJob({ organizationId: 4, vendorId: 5, runId: RUN_ID });

      expect(asMock(sharedVrdbLookup).mock.calls).toEqual([
        [{ organizationId: 8, vendorId: 9 }],
        [{ organizationId: 4, vendorId: 5 }],
      ]);
    });
  });

  it("gives the researcher no browser when the process has none: a page that needs a script is reported as such", async () => {
    asMock(sharedPageRenderer).mockReturnValue(undefined);

    await handleVendorResearchJob(DATA);

    expect(asMock(createVendorResearcher).mock.calls[0][0].render).toBeUndefined();
  });

  it("does not read the configuration and never ends the run itself: nothing has to be set up to search the web", async () => {
    await handleVendorResearchJob(DATA);

    expect(getVendorResearchConfig).not.toHaveBeenCalled();
    expect(runVendorResearch).toHaveBeenCalledTimes(1);
    expect(finishRunQuery).not.toHaveBeenCalled();
  });

  it("does not catch a rejection of the pipeline, so that BullMQ retries the job", async () => {
    const failure = new Error("could not mark the run running");
    asMock(runVendorResearch).mockRejectedValue(failure);

    await expect(handleVendorResearchJob(DATA)).rejects.toBe(failure);

    expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    expect(finishRunQuery).not.toHaveBeenCalled();
  });

  describe("the notice to the assignee", () => {
    it("tells the assignee once when an automatic run stored findings", async () => {
      await handleVendorResearchJob(DATA);

      expect(getVendorByIdQuery).toHaveBeenCalledWith(VENDOR, ORG);
      expect(notifyAssigneeOfVendorResearch).toHaveBeenCalledTimes(1);
      expect(notifyAssigneeOfVendorResearch).toHaveBeenCalledWith(
        ORG,
        { id: VENDOR, name: "Acme", assignee: ASSIGNEE },
        RUN_ID,
        2,
      );
    });

    // Nobody is looking at a scan: it runs by itself, and a finding is of no use until someone reads it.
    it("tells the assignee when a scheduled run stored findings", async () => {
      asMock(getRunByIdQuery).mockResolvedValue(makeRun({ trigger_type: "scheduled" }));

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).toHaveBeenCalledTimes(1);
      expect(notifyAssigneeOfVendorResearch).toHaveBeenCalledWith(
        ORG,
        { id: VENDOR, name: "Acme", assignee: ASSIGNEE },
        RUN_ID,
        2,
      );
    });

    it("says nothing after a scheduled run that stored no findings, which is most of them", async () => {
      asMock(getRunByIdQuery).mockResolvedValue(makeRun({ trigger_type: "scheduled" }));
      asMock(runVendorResearch).mockResolvedValue({ outcome: "completed", findingsCreated: 0 });

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it("says nothing after a manual run: the person who started it is looking at the result", async () => {
      asMock(getRunByIdQuery).mockResolvedValue(makeRun({ trigger_type: "manual" }));

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it("says nothing when the run stored no findings", async () => {
      asMock(runVendorResearch).mockResolvedValue({ outcome: "completed", findingsCreated: 0 });

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it("says nothing when the vendor has no assignee", async () => {
      asMock(getVendorByIdQuery).mockResolvedValue(makeVendor({ assignee: null as any }));

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it("says nothing when the vendor is gone", async () => {
      asMock(getVendorByIdQuery).mockResolvedValue(null);

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it.each(["failed", "skipped"] as const)("says nothing when the run %s", async (outcome) => {
      asMock(runVendorResearch).mockResolvedValue({ outcome, findingsCreated: 0 });

      await handleVendorResearchJob(DATA);

      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    it("does not make the job throw when the notice fails, and never touches the run", async () => {
      asMock(notifyAssigneeOfVendorResearch).mockRejectedValue(new Error("redis is down"));

      await expect(handleVendorResearchJob(DATA)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("redis is down"));
      expect(finishRunQuery).not.toHaveBeenCalled();
    });

    it("does not make the job throw when the vendor cannot be loaded for the notice", async () => {
      asMock(getVendorByIdQuery).mockRejectedValue(new Error("database is down"));

      await expect(handleVendorResearchJob(DATA)).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("database is down"));
      expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
    });

    // Vendor writes do not check the assignee, so it can be a user of another organization (the
    // rule of the accept path, R30, applies here too). The notice would be stored under the
    // vendor's organization for a user who never reads it.
    describe("an assignee who is not a user of the vendor's organization", () => {
      it("is checked against the organization of the vendor before the notice is written", async () => {
        await handleVendorResearchJob(DATA);

        expect(findUsersNotInOrganization).toHaveBeenCalledTimes(1);
        expect(findUsersNotInOrganization).toHaveBeenCalledWith([ASSIGNEE], ORG);
        expect(notifyAssigneeOfVendorResearch).toHaveBeenCalledTimes(1);
        expect(asMock(findUsersNotInOrganization).mock.invocationCallOrder[0]).toBeLessThan(
          asMock(notifyAssigneeOfVendorResearch).mock.invocationCallOrder[0],
        );
      });

      it("gets no notice, and the job and the run go on as if nothing had happened", async () => {
        asMock(findUsersNotInOrganization).mockResolvedValue([ASSIGNEE]);

        await expect(handleVendorResearchJob(DATA)).resolves.toBeUndefined();

        expect(findUsersNotInOrganization).toHaveBeenCalledWith([ASSIGNEE], ORG);
        expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
        // The run is over by then and the notice never touches it.
        expect(runVendorResearch).toHaveBeenCalledTimes(1);
        expect(finishRunQuery).not.toHaveBeenCalled();
        // Nothing above debug level: no error, no warning, no line at all that someone must read.
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
      });

      it("is only mentioned in the debug log, with ids and no names", async () => {
        asMock(findUsersNotInOrganization).mockResolvedValue([ASSIGNEE]);

        await handleVendorResearchJob(DATA);

        expect(logger.debug).toHaveBeenCalledTimes(1);
        const [line] = asMock(logger.debug).mock.calls[0];
        expect(line).toContain(`user ${ASSIGNEE}`);
        expect(line).toContain(`vendor ${VENDOR}`);
        expect(line).not.toContain("Acme");
      });

      it.each([0, -3, 1.5, Number.NaN])(
        "is not asked about at all when the assignee id %p is not a user id",
        async (assignee) => {
          // findUsersNotInOrganization ignores ids like these and reports nobody missing, which
          // would read as "is a member".
          asMock(getVendorByIdQuery).mockResolvedValue(makeVendor({ assignee }));

          await handleVendorResearchJob(DATA);

          expect(findUsersNotInOrganization).not.toHaveBeenCalled();
          expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
        },
      );

      it("does not make the job throw when the membership lookup fails, and no notice goes out", async () => {
        asMock(findUsersNotInOrganization).mockRejectedValue(new Error("database is down"));

        await expect(handleVendorResearchJob(DATA)).resolves.toBeUndefined();

        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("database is down"));
        expect(notifyAssigneeOfVendorResearch).not.toHaveBeenCalled();
        expect(finishRunQuery).not.toHaveBeenCalled();
      });
    });
  });
});
