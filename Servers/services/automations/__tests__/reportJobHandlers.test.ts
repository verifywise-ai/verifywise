import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../reporting/manualReportRunner", () => ({ executeManualRun: jest.fn() }));

import { handleManualReportGeneration } from "../reportJobHandlers";
import { executeManualRun } from "../../reporting/manualReportRunner";

const mockExecute = executeManualRun as jest.MockedFunction<typeof executeManualRun>;

describe("handleManualReportGeneration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("forwards the job payload to executeManualRun", async () => {
    const data = {
      runId: 12,
      request: {
        projectId: 7,
        frameworkId: 1,
        projectFrameworkId: 2,
        reportType: "project",
        format: "pdf" as const,
      },
      userId: 3,
      organizationId: 5,
    };

    await handleManualReportGeneration(data);

    expect(mockExecute).toHaveBeenCalledWith(12, data.request, 3, 5);
  });
});
