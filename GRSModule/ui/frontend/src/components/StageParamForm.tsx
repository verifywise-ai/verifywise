import type { ParamDef } from "../constants/stageParams";

interface Props {
  params: ParamDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export default function StageParamForm({ params, values, onChange }: Props) {
  if (params.length === 0) {
    return <p style={{ color: "#888", fontStyle: "italic" }}>No parameters for this stage.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {params.map((p) => {
        if (p.showWhen && values[p.showWhen.key] !== p.showWhen.value) return null;
        return (
          <label key={p.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</span>
            {p.type === "select" && p.options ? (
              <select
                value={String(values[p.key] ?? p.default)}
                onChange={(e) => onChange(p.key, e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc" }}
              >
                {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : p.type === "boolean" ? (
              <input
                type="checkbox"
                checked={Boolean(values[p.key] ?? p.default)}
                onChange={(e) => onChange(p.key, e.target.checked)}
              />
            ) : (
              <input
                type="number"
                value={values[p.key] == null ? "" : String(values[p.key])}
                placeholder={p.default == null ? "none" : String(p.default)}
                onChange={(e) => onChange(p.key, e.target.value === "" ? null : Number(e.target.value))}
                style={{ padding: "4px 8px", borderRadius: 4, border: "1px solid #ccc", width: 120 }}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}
