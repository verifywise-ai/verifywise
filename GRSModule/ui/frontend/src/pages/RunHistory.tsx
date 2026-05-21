import { useState } from "react";
import { useRunHistory, type RunHistoryEntry } from "../api/useHistory";

const STATUS_COLOR: Record<string, string> = {
  done: "#388e3c",
  failed: "#c62828",
  interrupted: "#e65100",
};

export default function RunHistory() {
  const { data: runs = [], isLoading } = useRunHistory();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (isLoading) return <p>Loading…</p>;
  if (runs.length === 0) return <p style={{ color: "#888" }}>No run history found.</p>;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Run History</h2>
      {runs.map((run: RunHistoryEntry) => (
        <div key={run.timestamp} style={{
          border: "1px solid #ddd", borderRadius: 8, marginBottom: 12, overflow: "hidden",
        }}>
          <div
            onClick={() => setExpanded(expanded === run.timestamp ? null : run.timestamp)}
            style={{
              padding: "10px 16px", cursor: "pointer", background: "#fafafa",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <div>
              <span style={{ fontFamily: "monospace", fontSize: 13 }}>{run.timestamp}</span>
              {run.dataset_version && (
                <span style={{ marginLeft: 12, color: "#1976d2", fontSize: 13 }}>
                  {run.dataset_version}
                </span>
              )}
              {run.stages && (
                <span style={{ marginLeft: 12, color: "#555", fontSize: 12 }}>
                  [{run.stages.join(" → ")}]
                </span>
              )}
            </div>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
              background: STATUS_COLOR[run.status] ?? "#888", color: "#fff",
            }}>
              {run.status}
            </span>
          </div>

          {expanded === run.timestamp && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid #eee" }}>
              {run.error_message && (
                <pre style={{ color: "#c62828", fontSize: 12, whiteSpace: "pre-wrap" }}>
                  {run.error_message}
                </pre>
              )}
              {!run.error_message && run.status === "done" && (
                <span style={{ color: "#388e3c", fontSize: 13 }}>Completed successfully.</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
