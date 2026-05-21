import { useState } from "react";
import { useDatasets } from "../api/useDatasets";
import { useLeaderboard } from "../api/useResults";

export default function Leaderboard() {
  const { data: versions = [] } = useDatasets();
  const [version, setVersion] = useState("");

  // Default to first version
  if (!version && versions.length > 0) {
    setVersion(versions[0]);
  }

  const { data, isLoading, error } = useLeaderboard(version);

  const dimensions: string[] = data?.dimensions ?? [];
  const rows: Record<string, unknown>[] = data?.rows ?? [];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Leaderboard</h2>

      <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "flex-end" }}>
        <label>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Dataset Version</div>
          <input
            list="lb-version-list"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid #ccc", width: 220 }}
          />
          <datalist id="lb-version-list">
            {versions.map((v) => <option key={v} value={v} />)}
          </datalist>
        </label>
        <a
          href="http://localhost:8501"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, color: "#1976d2" }}
        >
          Open Streamlit viewer ↗
        </a>
      </div>

      {isLoading && <p>Loading…</p>}
      {error && <p style={{ color: "#c62828" }}>No leaderboard found for this version.</p>}

      {data && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={th}>Model</th>
                <th style={th}>GRS (0–100)</th>
                {dimensions.map((d) => (
                  <th key={d} style={th}>{d.replace(/_/g, " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => (b.grs_score_100 as number) - (a.grs_score_100 as number))
                .map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={td}>{String(row.candidate_model_id)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>
                      {Number(row.grs_score_100).toFixed(1)}
                    </td>
                    {dimensions.map((d) => (
                      <td key={d} style={td}>
                        {Number(row[`${d}_score_100`]).toFixed(1)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "8px 12px", textAlign: "left", fontWeight: 600,
  borderBottom: "2px solid #ddd", whiteSpace: "nowrap",
};
const td: React.CSSProperties = { padding: "6px 12px" };
