import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import { CheckCircle, Link2, Unlink, Pencil, Circle } from "lucide-react";
import { AgentAuditLogEntry } from "src/domain/interfaces/i.agentDiscovery";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";

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
  const formatUserDate = useFormattedDate();
  const { t } = useTranslation();
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
          ? usersMap[String(entry.performed_by)] ||
            fill(t("User #{id}"), { id: entry.performed_by })
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
                {describeAction(entry, usersMap, t)}
              </Typography>
              <Typography fontSize={12} color="text.secondary">
                {actor} · {formatUserDate(entry.created_at, { includeTime: true })}
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

// Whole-sentence templates per editable field, so each sentence is one
// dictionary entry and translates with its word order intact.
const FIELD_UPDATE_TEXT: Record<string, { change: string; plain: string }> = {
  display_name: { change: 'Updated name: "{from}" → "{to}"', plain: "Updated name" },
  primitive_type: { change: 'Updated type: "{from}" → "{to}"', plain: "Updated type" },
  owner_id: {
    change: 'Updated primary owner: "{from}" → "{to}"',
    plain: "Updated primary owner",
  },
  owner_ids: { change: 'Updated owners: "{from}" → "{to}"', plain: "Updated owners" },
  metadata: { change: 'Updated details: "{from}" → "{to}"', plain: "Updated details" },
};

// Fields whose values are user ids (one, or a comma-separated list).
const OWNER_FIELDS = new Set(["owner_id", "owner_ids"]);

/** Resolve a comma-separated list of user ids to names. */
function formatOwners(
  value: string | null | undefined,
  usersMap: Record<string, string>,
  t: (key: string) => string,
): string {
  const ids = (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  if (ids.length === 0) return t("None");
  return ids.map((uid) => usersMap[uid] || fill(t("User #{id}"), { id: uid })).join(", ");
}

/** Turn a raw audit row into a readable sentence. */
function describeAction(
  entry: AgentAuditLogEntry,
  usersMap: Record<string, string>,
  t: (key: string) => string,
): string {
  switch (entry.action) {
    case "review_status_changed":
      return entry.new_value
        ? fill(t("Review status changed to {status}"), { status: entry.new_value })
        : t("Review status changed");
    case "model_linked":
      return t("Linked to a model in the inventory");
    case "model_unlinked":
      return t("Unlinked from its model");
    case "field_updated": {
      const fieldKey = entry.field_changed ?? "";
      const text = FIELD_UPDATE_TEXT[fieldKey] ?? {
        change: 'Updated {field}: "{from}" → "{to}"',
        plain: "Updated {field}",
      };
      const field = fieldKey.replace(/_/g, " ") || "field";
      if (OWNER_FIELDS.has(fieldKey)) {
        return fill(t(text.change), {
          field,
          from: formatOwners(entry.old_value, usersMap, t),
          to: formatOwners(entry.new_value, usersMap, t),
        });
      }
      if (entry.old_value != null && entry.new_value != null) {
        return fill(t(text.change), { field, from: entry.old_value, to: entry.new_value });
      }
      return fill(t(text.plain), { field });
    }
    default:
      return entry.action.replace(/_/g, " ");
  }
}

export default ActivityTimeline;
