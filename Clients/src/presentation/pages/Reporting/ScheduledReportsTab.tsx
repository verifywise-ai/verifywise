/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Button,
  Chip,
  Typography,
} from "@mui/material";
import {
  useScheduledReports,
  useRunNow,
  useSetActive,
} from "../../../application/hooks/useReporting";
import { showAlert } from "../../../infrastructure/api/customAxios";

export default function ScheduledReportsTab() {
  const { data: rows = [] } = useScheduledReports();
  const runNow = useRunNow();
  const setActive = useSetActive();

  const onActionError = () =>
    showAlert({ variant: "error", body: "Action failed", isToast: true });

  if (!rows.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No scheduled reports yet. Create one from the Templates tab.
      </Typography>
    );
  }

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Name</TableCell>
          <TableCell>Scope</TableCell>
          <TableCell>Next run</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>Actions</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r: any) => (
          <TableRow key={r.id}>
            <TableCell>{r.name}</TableCell>
            <TableCell>{r.scope}</TableCell>
            <TableCell>{r.next_run_at ? new Date(r.next_run_at).toLocaleString() : "—"}</TableCell>
            <TableCell>
              <Chip
                size="small"
                label={r.is_active ? "Active" : "Paused"}
                color={r.is_active ? "success" : "default"}
              />
            </TableCell>
            <TableCell>
              <Button
                size="small"
                onClick={() => runNow.mutate(r.id, { onError: onActionError })}
              >
                Run now
              </Button>
              <Button
                size="small"
                onClick={() =>
                  setActive.mutate(
                    { id: r.id, active: !r.is_active },
                    { onError: onActionError },
                  )
                }
              >
                {r.is_active ? "Pause" : "Resume"}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
