import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { CheckCircle, Link2, Unlink, Pencil, Circle } from "lucide-react";
import { AgentAuditLogEntry } from "src/domain/interfaces/i.agentDiscovery";
import { displayFormattedDateTime } from "../../../tools/isoDateToString";

interface ActivityTimelineProps {
  entries: AgentAuditLogEntry[];
  usersMap: Record<string, string>;
}

/**
 * Renders the agent's audit trail (agent_audit_log) as a vertical timeline.
 * Each entry is a governance action taken on the agent — review changes, model
 * link/unlink, and field edits.
 */
const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ entries, usersMap }) => {
  if (!entries.length) {
    return (
      <Typography fontSize={13} color="text.secondary">
        No activity recorded yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={0}>
      {entries.map((entry, idx) => {
        const isLast = idx === entries.length - 1;
        const actor = entry.performed_by
          ? usersMap[String(entry.performed_by)] || `User #${entry.performed_by}`
          : "System";
        return (
          <Stack key={entry.id} direction="row" spacing={1.5}>
            {/* Icon + connector rail */}
            <Stack alignItems="center" sx={{ flexShrink: 0 }}>
              <Box sx={{ mt: "2px" }}>{actionIcon(entry.action)}</Box>
              {!isLast && (
                <Box
                  sx={{ width: 2, flex: 1, backgroundColor: "#EAECF0", my: "4px", minHeight: 20 }}
                />
              )}
            </Stack>

            {/* Content */}
            <Box sx={{ pb: isLast ? 0 : "16px" }}>
              <Typography fontSize={13} sx={{ color: "#101828" }}>
                {describeAction(entry)}
              </Typography>
              <Typography fontSize={12} color="text.secondary">
                {actor} · {displayFormattedDateTime(entry.created_at)}
              </Typography>
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
};

function actionIcon(action: string): React.ReactElement {
  const size = 16;
  const sw = 1.5;
  switch (action) {
    case "review_status_changed":
      return <CheckCircle size={size} strokeWidth={sw} color="#13715B" />;
    case "model_linked":
      return <Link2 size={size} strokeWidth={sw} color="#1976D2" />;
    case "model_unlinked":
      return <Unlink size={size} strokeWidth={sw} color="#98A2B3" />;
    case "field_updated":
      return <Pencil size={size} strokeWidth={sw} color="#667085" />;
    default:
      return <Circle size={size} strokeWidth={sw} color="#98A2B3" />;
  }
}

/** Turn a raw audit row into a readable sentence. */
function describeAction(entry: AgentAuditLogEntry): string {
  switch (entry.action) {
    case "review_status_changed":
      return `Review status changed${entry.new_value ? ` to ${entry.new_value}` : ""}`;
    case "model_linked":
      return "Linked to a model in the inventory";
    case "model_unlinked":
      return "Unlinked from its model";
    case "field_updated": {
      const field = entry.field_changed ? entry.field_changed.replace(/_/g, " ") : "field";
      if (entry.old_value != null && entry.new_value != null) {
        return `Updated ${field}: "${entry.old_value}" → "${entry.new_value}"`;
      }
      return `Updated ${field}`;
    }
    default:
      return entry.action.replace(/_/g, " ");
  }
}

export default ActivityTimeline;
