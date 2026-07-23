import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPUTE_DIR = join(HERE, "..", "compute");
const PY = join(COMPUTE_DIR, "venv", "bin", "python");
const DATASETS = join(HERE, "..", "datasets");

export interface ComputeResult {
  psi?: number;
  auc?: number;
  gini?: number;
  ks?: number;
  fairness?: Record<string, Record<string, number>>;
}

// Runs the Python compute module for one dataset/period. Throws a clear error
// naming the dataset/period if the subprocess fails or returns non-JSON.
export const computeMetrics = (
  dataset: string,
  period: string,
  metrics: string[],
  segmentCol?: string,
): ComputeResult => {
  const args = [
    "__main__.py",
    "--dataset", join(DATASETS, dataset),
    "--period", period,
    "--metrics", metrics.join(","),
    "--feature-col", "feature",
  ];
  if (segmentCol) args.push("--segment-col", segmentCol);
  let stdout: string;
  try {
    stdout = execFileSync(PY, args, { cwd: COMPUTE_DIR, encoding: "utf8" });
  } catch (e) {
    const err = e as { stderr?: string };
    throw new Error(
      `compute failed for ${dataset} period ${period}: ${err.stderr?.trim() ?? String(e)}`,
    );
  }
  try {
    return JSON.parse(stdout) as ComputeResult;
  } catch {
    throw new Error(`compute returned non-JSON for ${dataset} period ${period}: ${stdout}`);
  }
};
