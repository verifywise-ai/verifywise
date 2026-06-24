/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Typography,
} from "@mui/material";
import { useReportRuns } from "../../../application/hooks/useReporting";

const statusColor = (status: string): "success" | "error" | "warning" | "default" => {
  if (status === "completed" || status === "success") return "success";
  if (status === "failed" || status === "error") return "error";
  if (status === "running" || status === "pending") return "warning";
  return "default";
};

// delivery_status is a JSONB object ({storage,emailLink,attachment}); summarize to a string
// so React never tries to render a raw object (which crashes the whole tree).
const formatDelivery = (d: any): string => {
  if (!d || typeof d !== "object") return d ?? "—";
  const parts = ["storage", "emailLink", "attachment"]
    .filter((k) => d[k]?.enabled)
    .map((k) => `${k}: ${d[k].status}`);
  return parts.length ? parts.join(", ") : "—";
};

export default function ArchiveTab() {
  const { data: runs = [], isLoading } = useReportRuns();

  if (isLoading) return <Typography>Loading runs…</Typography>;

  if (!runs.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No scheduled report runs yet.
      </Typography>
    );
  }

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Report</TableCell>
          <TableCell>Run at</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>Delivery</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {runs.map((r: any) => (
          <TableRow key={r.id}>
            <TableCell>{r.name ?? r.scheduled_report_name ?? `Run #${r.id}`}</TableCell>
            <TableCell>
              {r.run_at || r.created_at
                ? new Date(r.run_at ?? r.created_at).toLocaleString()
                : "—"}
            </TableCell>
            <TableCell>
              <Chip size="small" label={r.status ?? "unknown"} color={statusColor(r.status)} />
            </TableCell>
            <TableCell>{formatDelivery(r.delivery_status)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
