import type { ProgressCounts } from "../api/useProgress";

export default function ModelProgressBar({ model }: { model: ProgressCounts }) {
  const pct =
    model.total > 0 ? Math.round((model.completed / model.total) * 100) : 0;

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          marginBottom: 2,
        }}
      >
        <span style={{ fontFamily: "monospace" }}>{model.model_id}</span>
        <span style={{ color: "#555" }}>
          {model.completed}/{model.total}
          {model.failures > 0 && (
            <span style={{ color: "#e65100", marginLeft: 8 }}>
              ⚠ {model.failures} failed
            </span>
          )}
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: "#e0e0e0",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: model.failures > 0 ? "#ff8f00" : "#388e3c",
            borderRadius: 4,
            transition: "width 0.3s",
          }}
        />
      </div>
    </div>
  );
}
