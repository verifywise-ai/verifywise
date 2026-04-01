import { Request, Response } from "express";
import { STATUS_CODE } from "../utils/statusCode.utils";
import {
  getAllBenchmarksQuery,
  getBenchmarkByIdQuery,
  getBenchmarkIndustriesQuery,
  getBenchmarkAiRiskTypesQuery,
} from "../utils/riskBenchmark.utils";
import { logStructured } from "../utils/logger/fileLogger";

export async function getAllBenchmarks(
  req: Request,
  res: Response
): Promise<any> {
  const industry = req.query.industry as string | undefined;
  const aiRiskType = req.query.ai_risk_type as string | undefined;

  logStructured(
    "processing",
    "fetching risk benchmarks",
    "getAllBenchmarks",
    "riskBenchmark.ctrl.ts"
  );

  try {
    const benchmarks = await getAllBenchmarksQuery(industry, aiRiskType);
    return res.status(200).json(STATUS_CODE[200](benchmarks));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch risk benchmarks",
      "getAllBenchmarks",
      "riskBenchmark.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getBenchmarkById(
  req: Request,
  res: Response
): Promise<any> {
  const id = parseInt(req.params.id as string);

  logStructured(
    "processing",
    `fetching risk benchmark ID: ${id}`,
    "getBenchmarkById",
    "riskBenchmark.ctrl.ts"
  );

  try {
    const benchmark = await getBenchmarkByIdQuery(id);
    if (!benchmark) {
      return res.status(404).json(STATUS_CODE[404]("Benchmark not found"));
    }
    return res.status(200).json(STATUS_CODE[200](benchmark));
  } catch (error) {
    logStructured(
      "error",
      `failed to fetch risk benchmark ID: ${id}`,
      "getBenchmarkById",
      "riskBenchmark.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

export async function getBenchmarkFilters(
  _req: Request,
  res: Response
): Promise<any> {
  try {
    const [industries, aiRiskTypes] = await Promise.all([
      getBenchmarkIndustriesQuery(),
      getBenchmarkAiRiskTypesQuery(),
    ]);
    return res.status(200).json(STATUS_CODE[200]({ industries, aiRiskTypes }));
  } catch (error) {
    logStructured(
      "error",
      "failed to fetch benchmark filters",
      "getBenchmarkFilters",
      "riskBenchmark.ctrl.ts"
    );
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
