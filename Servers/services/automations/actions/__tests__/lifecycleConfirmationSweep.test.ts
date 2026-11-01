import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn<any>(),
}));
jest.mock("../../../../utils/lifecycle.utils", () => {
  const actual = jest.requireActual<any>("../../../../utils/lifecycle.utils");
  return {
    ...actual,
    findConfirmationsDue: jest.fn<any>(),
    getLifecycleOrgSettings: jest.fn<any>(),
    markConfirmationReminded: jest.fn<any>().mockResolvedValue(undefined),
  };
});
jest.mock("../../../inAppNotification.service", () => ({
  notifyLifecycleConfirmationDue: jest.fn<any>(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  runLifecycleConfirmationSweep,
  runLifecycleConfirmationSweepAllOrgs,
} from "../lifecycleConfirmationSweep";
import {
  LIFECYCLE_ENTITIES,
  findConfirmationsDue,
  getLifecycleOrgSettings,
  markConfirmationReminded,
} from "../../../../utils/lifecycle.utils";
import { notifyLifecycleConfirmationDue } from "../../../inAppNotification.service";
import { getAllOrganizationsQuery } from "../../../../utils/organization.utils";

const m = (fn: unknown) => fn as jest.MockedFunction<any>;

beforeEach(() => {
  jest.clearAllMocks();
  m(getLifecycleOrgSettings).mockResolvedValue({
    organization_id: 3,
    confirmation_interval_days: 30,
  });
});

describe("runLifecycleConfirmationSweep", () => {
  it("uses the org interval, emails each owner and stamps only successful sends", async () => {
    m(findConfirmationsDue).mockResolvedValue([
      { id: 11, title: "Chatbot", owner: 4, baseline: new Date("2026-06-01T00:00:00Z") },
      { id: 12, title: "Scoring", owner: 5, baseline: "2026-05-01" },
    ]);
    m(notifyLifecycleConfirmationDue)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("smtp down"));

    const summary = await runLifecycleConfirmationSweep(3, LIFECYCLE_ENTITIES.use_case);

    expect(findConfirmationsDue).toHaveBeenCalledWith(LIFECYCLE_ENTITIES.use_case, 3, 30);
    expect(m(notifyLifecycleConfirmationDue).mock.calls[0]).toEqual([
      3,
      4,
      expect.objectContaining({
        id: 11,
        title: "Chatbot",
        noun: "use case",
        path: "/project-view?projectId=11",
        since: "2026-06-01",
        intervalDays: 30,
      }),
      expect.any(String),
    ]);
    // The failed send is not stamped, so tomorrow's run retries it.
    expect(markConfirmationReminded).toHaveBeenCalledTimes(1);
    expect(markConfirmationReminded).toHaveBeenCalledWith(LIFECYCLE_ENTITIES.use_case, 3, 11);
    expect(summary).toEqual({ organization_id: 3, entity: "use_case", candidates: 2, notified: 1 });
  });
});

describe("runLifecycleConfirmationSweepAllOrgs", () => {
  it("sweeps every lifecycle entity in every org and keeps going when one fails", async () => {
    m(getAllOrganizationsQuery).mockResolvedValue([{ id: 1 }, { id: 2 }]);
    m(findConfirmationsDue).mockImplementation(async (entity: any, orgId: number) => {
      if (orgId === 1 && entity.key === "use_case") throw new Error("boom");
      if (orgId === 2 && entity.key === "ai_app") {
        return [{ id: 7, title: "Notes bot", owner: 1, baseline: "2026-01-01" }];
      }
      return [];
    });
    m(notifyLifecycleConfirmationDue).mockResolvedValue(undefined);

    await runLifecycleConfirmationSweepAllOrgs();

    // Use cases and AI apps, for both orgs, even after org 1's use cases failed.
    expect(m(findConfirmationsDue).mock.calls.map((c: any[]) => [c[0].key, c[1]])).toEqual([
      ["use_case", 1],
      ["ai_app", 1],
      ["use_case", 2],
      ["ai_app", 2],
    ]);
    expect(m(notifyLifecycleConfirmationDue).mock.calls[0][2]).toMatchObject({
      noun: "AI app",
      path: "/ai-apps/7",
      entityType: "ai_app",
    });
    expect(markConfirmationReminded).toHaveBeenCalledWith(LIFECYCLE_ENTITIES.ai_app, 2, 7);
  });
});
