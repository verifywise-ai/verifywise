import { useState, useEffect } from "react";
import yaml from "js-yaml";
import { useRunStatus, useStartRun, useStopRun, type RunRequest } from "../api/useRun";
import { useDatasets } from "../api/useDatasets";
import { useConfig } from "../api/useConfig";
import { useSummary } from "../api/useResults";
import PipelineStatusFlow from "../components/PipelineStatusFlow";
import StageParamForm from "../components/StageParamForm";
import { STAGE_PARAMS } from "../constants/stageParams";

const ALL_STAGES = ["seeds", "render", "perturb", "validate", "infer", "judge"];

function defaultParams() {
  return {
    seed: 42, per_obligation: 2, k_per_base: 3, coverage: "per_family",
    provider: "openrouter", validator_model_id: "openai/gpt-4o-mini",
    infer_provider: "openrouter", temperature: 0.2, max_tokens: 500,
    limit: null, resume: true, judge_temperature: 0.0,
  };
}

export default function Overview() {
  const { data: runStatus } = useRunStatus();
  const { data: versions = [] } = useDatasets();
  const startRun = useStartRun();
  const stopRun = useStopRun();

  const [version, setVersion] = useState("");
  const [selectedStages, setSelectedStages] = useState<string[]>(ALL_STAGES);
  const [params, setParams] = useState(defaultParams());
  const [startError, setStartError] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());

  const toggleExpanded = (stage: string) =>
    setExpandedStages((prev) => {
      const next = new Set(prev);
      next.has(stage) ? next.delete(stage) : next.add(stage);
      return next;
    });

  // Populate defaults from run_config.yaml
  const { data: runConfigYaml } = useConfig("run_config");
  useEffect(() => {
    if (!runConfigYaml) return;
    try {
      const cfg = yaml.load(runConfigYaml) as Record<string, unknown>;
      if (typeof cfg?.version === "string") setVersion(cfg.version);
      const stages = cfg?.stages as Record<string, Record<string, unknown>> | undefined;
      if (stages) {
        setParams((p) => ({
          ...p,
          seed: (stages.render?.seed as number) ?? p.seed,
          per_obligation: (stages.render?.per_obligation as number) ?? p.per_obligation,
          k_per_base: (stages.perturb?.k_per_base as number) ?? p.k_per_base,
          coverage: (stages.perturb?.coverage as string) ?? p.coverage,
          provider: (stages.validate?.provider as string) ?? p.provider,
          validator_model_id: (stages.validate?.validator_model_id as string) ?? p.validator_model_id,
          infer_provider: (stages.infer?.provider as string) ?? p.infer_provider,
          temperature: (stages.infer?.temperature as number) ?? p.temperature,
          max_tokens: (stages.infer?.max_tokens as number) ?? p.max_tokens,
          judge_temperature: (stages.judge?.judge_temperature as number) ?? p.judge_temperature,
        }));
      }
    } catch {
      // ignore parse errors
    }
  }, [runConfigYaml]);

  // Default version to most recent
  useEffect(() => {
    if (!version && versions.length > 0) setVersion(versions[0]);
  }, [versions]);

  const { data: summary } = useSummary(version);
  const isRunning = runStatus?.state === "running";

  const toggleStage = (s: string) =>
    setSelectedStages((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  const handleRun = async () => {
    setStartError(null);
    const req: RunRequest = { dataset_version: version, stages: selectedStages, params };
    try {
      await startRun.mutateAsync(req);
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ marginTop: 0 }}>Pipeline Overview</h2>

      <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "flex-end" }}>
        <label>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Dataset Version</div>
          <input
            list="version-list"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid #ccc", width: 220 }}
            placeholder="e.g. grs_scenarios_v0.1"
          />
          <datalist id="version-list">
            {versions.map((v) => <option key={v} value={v} />)}
          </datalist>
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Stages</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ALL_STAGES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStage(s)}
              style={{
                padding: "4px 12px", borderRadius: 16, fontSize: 13, cursor: "pointer",
                border: "1px solid #aaa",
                backgroundColor: selectedStages.includes(s) ? "#1976d2" : "#f5f5f5",
                color: selectedStages.includes(s) ? "#fff" : "#333",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {selectedStages.some((s) => (STAGE_PARAMS[s] ?? []).length > 0) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Parameters</div>
          {selectedStages
            .filter((s) => (STAGE_PARAMS[s] ?? []).length > 0)
            .map((stage) => {
              const isOpen = expandedStages.has(stage);
              return (
                <div key={stage} style={{ border: "1px solid #e0e0e0", borderRadius: 6, marginBottom: 6 }}>
                  <button
                    onClick={() => toggleExpanded(stage)}
                    style={{
                      width: "100%", textAlign: "left", padding: "8px 12px",
                      background: isOpen ? "#f0f4ff" : "#fafafa",
                      border: "none", cursor: "pointer", borderRadius: 6,
                      fontSize: 13, fontWeight: 500, display: "flex",
                      justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <span style={{ textTransform: "capitalize" }}>{stage}</span>
                    <span style={{ color: "#888", fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: "12px 16px", borderTop: "1px solid #e0e0e0" }}>
                      <StageParamForm
                        params={STAGE_PARAMS[stage] ?? []}
                        values={params}
                        onChange={(key, val) => setParams((p) => ({ ...p, [key]: val }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <button
          onClick={handleRun}
          disabled={isRunning || !version || selectedStages.length === 0}
          style={{
            padding: "8px 20px", borderRadius: 6, fontWeight: 600,
            background: isRunning ? "#aaa" : "#1976d2", color: "#fff",
            border: "none", cursor: isRunning ? "not-allowed" : "pointer",
          }}
        >
          {isRunning ? "Running…" : "Run Pipeline"}
        </button>
        {isRunning && (
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

      {startError && (
        <div style={{ color: "#c62828", marginBottom: 12, fontSize: 14 }}>
          Error: {startError}
        </div>
      )}

      <h3>Pipeline Status</h3>
      <PipelineStatusFlow run={runStatus} />

      <h3 style={{ marginTop: 24 }}>Stats</h3>
      <div style={{ display: "flex", gap: 16 }}>
        {[
          { label: "Scenarios", value: summary?.scenarios },
          { label: "Responses", value: summary?.responses },
          { label: "Scores", value: summary?.scores },
          { label: "Models", value: summary?.models_inferred },
        ].map(({ label, value }) => (
          <div key={label} style={{
            padding: "12px 20px", border: "1px solid #ddd",
            borderRadius: 8, minWidth: 100, textAlign: "center",
          }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {value == null ? "—" : value}
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
