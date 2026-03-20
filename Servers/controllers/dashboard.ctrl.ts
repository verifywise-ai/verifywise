import { Request, Response } from "express";
import { logFailure, logProcessing, logSuccess } from "../utils/logger/logHelper";
import { STATUS_CODE } from "../utils/statusCode.utils";
import { getDashboardDataQuery } from "../utils/dashboard.utils";

export async function getDashboardData(req: Request, res: Response) {
  logProcessing({
    description: "starting getDashboardData",
    functionName: "getDashboardData",
    fileName: "dashboard.ctrl.ts",
    userId: req.userId!,
    tenantId: req.organizationId!,
  });

  try {
    const dashboard = await getDashboardDataQuery(req.organizationId!, req.userId!, req.role!);

    await logSuccess({
      eventType: "Read",
      description: "Retrieved dashboard data successfully",
      functionName: "getDashboardData",
      fileName: "dashboard.ctrl.ts",
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res
      .status(dashboard ? 200 : 204)
      .json(STATUS_CODE[dashboard ? 200 : 204](dashboard));
  } catch (error) {
    await logFailure({
      eventType: "Read",
      description: "Failed to retrieve dashboard data",
      functionName: "getDashboardData",
      fileName: "dashboard.ctrl.ts",
      error: error as Error,
      userId: req.userId!,
      tenantId: req.organizationId!,
    });

    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}