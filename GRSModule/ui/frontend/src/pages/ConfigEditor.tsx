import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useConfig, useSaveConfig } from "../api/useConfig";
import { useConfigContext } from "../context/ConfigContext";
import YamlEditor from "../components/YamlEditor";

const CONFIG_FILE_PATHS: Record<string, string> = {
  obligations:  "configs/obligations.yaml",
  mutations:    "configs/mutations.yaml",
  judge_rubric: "configs/judge_rubric.yaml",
  models:       "configs/models.yaml",
  templates:    "configs/templates/base_scenarios.yaml",
  run_config:   "configs/run_config.yaml",
};

const USED_BY: Record<string, string[]> = {
  obligations:  ["seeds", "render", "validate"],
  mutations:    ["perturb"],
  judge_rubric: ["judge"],
  models:       ["infer", "judge"],
  templates:    ["render"],
  run_config:   ["all stages (default params)"],
};

export default function ConfigEditor() {
  const { name = "" } = useParams<{ name: string }>();
  const { data: savedContent, isLoading } = useConfig(name);
  const saveConfig = useSaveConfig(name);
  const { markDirty, markClean } = useConfigContext();

  const [draft, setDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (savedContent !== undefined) setDraft(savedContent);
  }, [savedContent]);

  const isDirty = draft !== (savedContent ?? "");

  useEffect(() => {
    if (isDirty) markDirty(name);
    else markClean(name);
  }, [isDirty, name, markDirty, markClean]);

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveConfig.mutateAsync(draft);
      markClean(name);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleReset = () => {
    setDraft(savedContent ?? "");
    markClean(name);
  };

  if (isLoading) return <p>Loading…</p>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ marginTop: 0 }}>{name}</h2>
        <div style={{ fontSize: 12, color: "#555", fontFamily: "monospace" }}>
          {CONFIG_FILE_PATHS[name] ?? name}
        </div>
        {USED_BY[name] && (
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
            Used by: {USED_BY[name].join(", ")}
          </div>
        )}
      </div>

      <YamlEditor value={draft} onChange={setDraft} height="500px" />

      <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
        <button
          onClick={handleSave}
          disabled={!isDirty || saveConfig.isPending}
          style={{
            padding: "8px 20px", borderRadius: 6, fontWeight: 600,
            background: isDirty ? "#1976d2" : "#aaa", color: "#fff",
            border: "none", cursor: isDirty ? "pointer" : "not-allowed",
          }}
        >
          Save
        </button>
        <button
          onClick={handleReset}
          disabled={!isDirty}
          style={{
            padding: "8px 16px", borderRadius: 6,
            background: "transparent", border: "1px solid #aaa",
            cursor: isDirty ? "pointer" : "not-allowed",
          }}
        >
          Reset
        </button>
        {saveSuccess && <span style={{ color: "#388e3c", fontSize: 13 }}>Saved!</span>}
        {saveError && <span style={{ color: "#c62828", fontSize: 13 }}>{saveError}</span>}
      </div>
    </div>
  );
}
