import {
  Alert,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import { Link as RouterLink } from "react-router";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import type { JiraIncidentEvent } from "../../../../application/repository/jiraIncidents.repository";

const EVENT_LABELS: Record<string, string> = {
  imported: "Imported",
  status_from_jira: "Status from Jira",
  status_to_jira: "Status to Jira",
  conflict: "Conflict",
  error: "Error",
  deleted_in_jira: "Deleted in Jira",
};

const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** What happened, in a few words: the reason, a status move, or the conflict outcome. */
export function eventDetail(event: JiraIncidentEvent): string {
  const d = event.detail ?? {};
  if (event.kind === "conflict") {
    const loser = d.winner === "jira" ? text(d.vw_status) : text(d.jira_status);
    const applied = text(d.applied);
    if (applied && loser) return `Kept ${applied}; ${loser} was overwritten`;
  }
  const reason = text(d.reason);
  if (reason) return reason;
  if (text(d.skipped)) return "Jira left unchanged";
  const from = text(d.from);
  const to = text(d.to);
  if (from && to) return `${from} → ${to}`;
  return text(d.status) ?? "";
}

interface SyncActivityProps {
  events: JiraIncidentEvent[];
  loadFailed: boolean;
}

export function SyncActivity({ events, loadFailed }: SyncActivityProps) {
  const theme = useTheme();
  const formatDate = useFormattedDate();
  const cell = { borderColor: theme.palette.border.light, py: "8px", px: "12px", fontSize: 13 };

  if (loadFailed) {
    return (
      <Alert severity="error" sx={{ fontSize: "13px" }}>
        Could not load the sync activity.
      </Alert>
    );
  }
  if (events.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" fontSize={13}>
        No sync activity yet
      </Typography>
    );
  }
  return (
    <Table size="small" sx={{ border: `1px solid ${theme.palette.border.dark}` }}>
      <TableHead>
        <TableRow>
          {["Time", "Event", "Incident", "Jira issue", "Details"].map((h) => (
            <TableCell key={h} sx={{ ...cell, fontWeight: 600 }}>
              {h}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell sx={{ ...cell, whiteSpace: "nowrap" }}>
              {formatDate(new Date(event.created_at), { includeTime: true })}
            </TableCell>
            <TableCell sx={cell}>{EVENT_LABELS[event.kind] ?? event.kind}</TableCell>
            <TableCell sx={cell}>
              {event.incident_id !== null ? (
                <Link
                  component={RouterLink}
                  to={`/ai-incident-managements?incidentId=${event.incident_id}`}
                >
                  {event.incident_code ?? `#${event.incident_id}`}
                </Link>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell sx={cell}>
              {event.jira_url && event.jira_issue_key ? (
                <Link href={event.jira_url} target="_blank" rel="noopener noreferrer">
                  {event.jira_issue_key}
                </Link>
              ) : (
                (text(event.detail?.jira_issue_key) ?? "—")
              )}
            </TableCell>
            <TableCell sx={{ ...cell, wordBreak: "break-word" }}>{eventDetail(event)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default SyncActivity;
