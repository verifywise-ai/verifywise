import type { RunStatus } from "../api/useRun";
import ErrorDetail from "./ErrorDetail";

const STAGES = ["seeds", "render", "perturb", "validate", "infer", "judge"];

type StageStatus = "pending" | "running" | "done" | "failed";

function getStageStatus(stage: string, run: RunStatus | undefined): StageStatus {
  if (!run || run.state === "idle") return "pending";
  if (run.active_stage === stage) return "running";
  if (run.state === "done") return "done";
  if (run.state === "failed") {
    const failedIdx = run.active_stage
      ? STAGES.indexOf(run.active_stage)
      : -1;
    const stageIdx = STAGES.indexOf(stage);
    if (stageIdx < failedIdx) return "done";
    if (stageIdx === failedIdx) return "failed";
    return "pending";
  }
  // running state: stages before active are done
  const activeIdx = run.active_stage ? STAGES.indexOf(run.active_stage) : -1;
  const stageIdx = STAGES.indexOf(stage);
  return stageIdx < activeIdx ? "done" : "pending";
}

const COLOR: Record<StageStatus, string> = {
  pending: "#e0e0e0",
  running: "#1976d2",
  done: "#388e3c",
  failed: "#c62828",
};

export default function PipelineStatusFlow({
  run,
}: {
  run: RunStatus | undefined;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          flexWrap: "wrap",
        }}
      >
        {STAGES.map((stage, i) => {
          const status = getStageStatus(stage, run);
          return (
            <div key={stage} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: 16,
                  backgroundColor: COLOR[status],
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {stage}
              </div>
              {i < STAGES.length - 1 && <span style={{ color: "#bbb" }}>→</span>}
            </div>
          );
        })}
      </div>
      {run?.state === "failed" && run.error && (
        <ErrorDetail error={run.error} />
      )}
    </div>
  );
}
