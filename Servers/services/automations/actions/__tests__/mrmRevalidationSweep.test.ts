import { runRevalidationSweep } from "../mrmRevalidationSweep";
import {
  getDueRevalidationsQuery,
  triggerRevalidation,
} from "../../../../utils/mrmRevalidation.utils";
import { notifyRevalidationDue } from "../../../../utils/mrmAlerts.utils";

jest.mock("../../../../utils/mrmRevalidation.utils", () => ({
  getDueRevalidationsQuery: jest.fn(),
  triggerRevalidation: jest.fn(),
  MrmRevalidationTriggerSource: { SCHEDULED: "scheduled" },
}));
jest.mock("../../../../utils/mrmAlerts.utils", () => ({
  notifyRevalidationDue: jest.fn(),
}));
jest.mock("../../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));
jest.mock("../../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
}));

const mockDue = getDueRevalidationsQuery as jest.Mock;
const mockTrigger = triggerRevalidation as jest.Mock;
const mockNotify = notifyRevalidationDue as jest.Mock;

const NEXT_DUE = new Date("2026-06-01T00:00:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  mockNotify.mockResolvedValue(undefined);
});

describe("runRevalidationSweep overdue alerts", () => {
  it("notifies for every swept validation (annotate AND create paths)", async () => {
    mockDue.mockResolvedValue([
      { model_inventory_id: 7, next_due: NEXT_DUE },
      { model_inventory_id: 8, next_due: NEXT_DUE },
    ]);
    mockTrigger
      .mockResolvedValueOnce({ created_validation: false, validation_id: 71 })
      .mockResolvedValueOnce({ created_validation: true, validation_id: 81 });

    const summary = await runRevalidationSweep(1);

    expect(summary).toEqual({ organization_id: 1, due: 2, opened: 1, annotated: 1 });
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(1, 7, 71, NEXT_DUE);
    expect(mockNotify).toHaveBeenCalledWith(1, 8, 81, NEXT_DUE);
  });

  it("a notify failure never fails the sweep or skews the counters", async () => {
    mockDue.mockResolvedValue([{ model_inventory_id: 7, next_due: NEXT_DUE }]);
    mockTrigger.mockResolvedValue({ created_validation: false, validation_id: 71 });
    mockNotify.mockRejectedValue(new Error("boom"));

    const summary = await runRevalidationSweep(1);
    expect(summary.annotated).toBe(1);
  });

  it("skips the notify when the trigger returned no validation id", async () => {
    mockDue.mockResolvedValue([{ model_inventory_id: 7, next_due: NEXT_DUE }]);
    mockTrigger.mockResolvedValue({ created_validation: false, validation_id: null });

    await runRevalidationSweep(1);
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
