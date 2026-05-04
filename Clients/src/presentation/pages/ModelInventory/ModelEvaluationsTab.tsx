import { useState, useEffect, useMemo } from "react";
import { Box, Stack, Typography, Alert as MuiAlert } from "@mui/material";
import { FlaskConical, AlertTriangle } from "lucide-react";
import Chip from "../../components/Chip";
import { palette } from "../../themes/palette";
import {
  getAllModelEvaluations,
  type ModelEvaluation,
  type ModelEvaluationsResponse,
} from "../../../application/repository/modelEvaluations.repository";

const statusColorMap: Record<string, string> = {
  completed: "#4caf50",
  running: "#ff9800",
  pending: "#9e9e9e",
  failed: "#f44336",
};

function hasFailedMetrics(eval_: ModelEvaluation): boolean {
  if (eval_.eval_type === "experiment") {
    const results = eval_.results;
    if (!results?.metric_results) return false;
    const thresholds = eval_.config?.thresholds || eval_.config?.metric_thresholds || {};
    for (const [metric, data] of Object.entries(results.metric_results)) {
      const score = (data as any)?.average ?? (data as any)?.score;
      const threshold = thresholds[metric];
      if (score !== undefined && threshold !== undefined && score < threshold) {
        return true;
      }
    }
    return false;
  }
  if (eval_.eval_type === "bias_audit") {
    const results = eval_.results;
    if (!results?.categories) return false;
    for (const cat of Object.values(results.categories) as any[]) {
      if (cat?.groups) {
        for (const group of cat.groups) {
          if (group.flagged) return true;
        }
      }
    }
    return false;
  }
  return false;
}

function getKeyResult(eval_: ModelEvaluation): string {
  if (eval_.eval_type === "experiment") {
    const results = eval_.results?.metric_results;
    if (!results) return "—";
    const entries = Object.entries(results);
    if (entries.length === 0) return "—";
    const [metric, data] = entries[0];
    const score = (data as any)?.average ?? (data as any)?.score;
    return score !== undefined ? `${metric}: ${(score as number).toFixed(2)}` : "—";
  }
  if (eval_.eval_type === "bias_audit") {
    const results = eval_.results;
    if (!results?.categories) return "—";
    const cats = Object.values(results.categories) as any[];
    const totalGroups = cats.reduce((sum, c) => sum + (c?.groups?.length || 0), 0);
    const flagged = cats.reduce(
      (sum, c) => sum + (c?.groups?.filter((g: any) => g.flagged)?.length || 0),
      0,
    );
    return flagged > 0 ? `${flagged}/${totalGroups} flagged` : `${totalGroups} groups passed`;
  }
  return "—";
}

export default function ModelEvaluationsTab() {
  const [data, setData] = useState<ModelEvaluationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAllModelEvaluations()
      .then(setData)
      .catch(() => setData({ experiments: [], biasAudits: [] }))
      .finally(() => setLoading(false));
  }, []);

  const allEvals = useMemo(() => {
    if (!data) return [];
    return [...data.experiments, ...data.biasAudits].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [data]);

  const flaggedCount = useMemo(() => allEvals.filter(hasFailedMetrics).length, [allEvals]);

  if (loading) {
    return (
      <Box sx={{ p: "24px", textAlign: "center" }}>
        <Typography sx={{ fontSize: "13px", color: palette.text.secondary }}>
          Loading evaluations...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: "16px" }}>
      {flaggedCount > 0 && (
        <MuiAlert
          severity="warning"
          icon={<AlertTriangle size={16} strokeWidth={1.5} />}
          sx={{ mb: "16px", fontSize: "13px", borderRadius: "4px" }}
        >
          {flaggedCount} evaluation{flaggedCount !== 1 ? "s" : ""} flagged a potential risk.
          Consider adding {flaggedCount !== 1 ? "these" : "this"} to the risk register.
        </MuiAlert>
      )}

      {allEvals.length === 0 ? (
        <Box sx={{ textAlign: "center", py: "48px" }}>
          <FlaskConical size={32} color={palette.text.secondary} strokeWidth={1.5} />
          <Typography sx={{ mt: "8px", fontSize: "13px", color: palette.text.secondary }}>
            No evaluations linked to any model yet
          </Typography>
          <Typography sx={{ mt: "4px", fontSize: "12px", color: palette.text.secondary }}>
            Link evaluations to models when creating experiments or bias audits in LLM Evals
          </Typography>
        </Box>
      ) : (
        <Box
          component="table"
          sx={{
            width: "100%",
            borderCollapse: "collapse",
            "& th": {
              textAlign: "left",
              fontSize: "11px",
              fontWeight: 600,
              color: palette.text.secondary,
              textTransform: "uppercase",
              p: "8px 12px",
              borderBottom: `1px solid ${palette.border.light}`,
            },
            "& td": {
              fontSize: "13px",
              p: "10px 12px",
              borderBottom: `1px solid ${palette.border.light}`,
            },
          }}
        >
          <thead>
            <tr>
              <th>Name</th>
              <th>Model</th>
              <th>Type</th>
              <th>Status</th>
              <th>Key result</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {allEvals.map((e) => (
              <tr key={e.id}>
                <td>{e.name || e.id}</td>
                <td>
                  {e.model_provider && e.model_name ? `${e.model_provider} — ${e.model_name}` : "—"}
                </td>
                <td>{e.eval_type === "experiment" ? "Experiment" : "Bias audit"}</td>
                <td>
                  <Chip
                    label={e.status}
                    backgroundColor={`${statusColorMap[e.status] || "#9e9e9e"}20`}
                    textColor={statusColorMap[e.status] || "#9e9e9e"}
                    size="small"
                  />
                </td>
                <td>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography sx={{ fontSize: "13px" }}>{getKeyResult(e)}</Typography>
                    {hasFailedMetrics(e) && (
                      <AlertTriangle size={14} color="#f44336" strokeWidth={1.5} />
                    )}
                  </Stack>
                </td>
                <td>
                  {e.created_at
                    ? new Date(e.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </Box>
      )}
    </Box>
  );
}
