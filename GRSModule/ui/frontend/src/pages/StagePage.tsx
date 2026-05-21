import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useRunStatus, useStartRun, useStopRun, type RunRequest } from "../api/useRun";
import { useProgress } from "../api/useProgress";
import { STAGE_PARAMS } from "../constants/stageParams";
import { STAGE_CONFIGS } from "../constants/stageConfigs";
import StageParamForm from "../components/StageParamForm";
import ModelProgressBar from "../components/ModelProgressBar";
import ErrorDetail from "../components/ErrorDetail";

const PROGRESS_STAGES = new Set(["infer", "judge"]);

export default function StagePage() {
  const { stage = "" } = useParams<{ stage: string }>();
  const paramDefs = STAGE_PARAMS[stage] ?? [];
  const configLinks = STAGE_CONFIGS[stage] ?? [];

  const [datasetVersion, setDatasetVersion] = useState("debug");
  const [paramValues, setParamValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(paramDefs.map((p) => [p.key, p.default]))
  );
  const [runError, setRunError] = useState<string | null>(null);

  const { data: runStatus } = useRunStatus();
  const startRun = useStartRun();
  const stopRun = useStopRun();

  const isThisStageRunning =
    runStatus?.state === "running" && runStatus?.active_stage === stage;
  const isAnyRunning = runStatus?.state === "running";

  const { data: progressModels = [] } = useProgress(stage, datasetVersion);

  const handleRun = async () => {
    setRunError(null);
    const req: RunRequest = {
      dataset_version: datasetVersion,
      stages: [stage],
      params: paramValues,
    };
    try {
      await startRun.mutateAsync(req);
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  const lastRunFailed =
    runStatus?.state === "failed" && runStatus?.active_stage === null;

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ marginTop: 0, textTransform: "capitalize" }}>{stage}</h2>

      <label style={{ display: "block", marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 500, marginRight: 8 }}>Dataset Version:</span>
        <input
          value={datasetVersion}
          onChange={(e) => setDatasetVersion(e.target.value)}
          style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc" }}
        />
      </label>

      {configLinks.length > 0 && (
        <div style={{ marginBottom: 16, fontSize: 13 }}>
          <strong>Configs: </strong>
          {configLinks.map((c, i) => (
            <span key={c}>
              <Link to={`/config/${c}`}>{c}</Link>
              {i < configLinks.length - 1 && ", "}
            </span>
          ))}
        </div>
      )}

      <h3>Parameters</h3>
      <StageParamForm
        params={paramDefs}
        values={paramValues}
        onChange={(key, val) => setParamValues((p) => ({ ...p, [key]: val }))}
      />

      <div style={{ display: "flex", gap: 12, marginTop: 20, marginBottom: 12 }}>
        <button
          onClick={handleRun}
          disabled={isAnyRunning}
          style={{
            padding: "8px 20px", borderRadius: 6, fontWeight: 600,
            background: isAnyRunning ? "#aaa" : "#1976d2", color: "#fff",
            border: "none", cursor: isAnyRunning ? "not-allowed" : "pointer",
          }}
        >
          {isThisStageRunning ? "Running…" : `Run ${stage}`}
        </button>
        {isThisStageRunning && (
          <button
            onClick={() => stopRun.mutate()}
            style={{
              padding: "8px 20px", borderRadius: 6, fontWeight: 600,
              background: "#c62828", color: "#fff", border: "none", cursor: "pointer",
            }}
          >
            Stop
          </button>
        )}
      </div>

      {runError && <div style={{ color: "#c62828", fontSize: 13 }}>{runError}</div>}
      {lastRunFailed && runStatus?.error && <ErrorDetail error={runStatus.error} />}

      {PROGRESS_STAGES.has(stage) && progressModels.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Progress</h3>
          {progressModels.map((m) => (
            <ModelProgressBar key={m.model_id} model={m} />
          ))}
        </div>
      )}
    </div>
  );
}
