import { useState } from "react";
import { Alert, Stack, Typography } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import Checkbox from "../../../components/Inputs/Checkbox";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";
import {
  SLACK_ROUTING_TYPES,
  type SlackConnection,
} from "../../../../application/repository/slack.repository";
import { channelLabel } from "./channelLabel";

interface SlackRoutingModalProps {
  /** The connection being edited. Render with key={connection.id} so each opening starts fresh. */
  connection: SlackConnection;
  onClose: () => void;
  /** Saves the routing; rejects with the message to show when the save fails. */
  onSave: (connection: SlackConnection, routing: string[]) => Promise<void>;
}

/**
 * Notification routing for one connection, preselected with what it receives
 * now. Stays open with the error shown inside until the save succeeds.
 */
export function SlackRoutingModal({ connection, onClose, onSave }: SlackRoutingModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(connection.routing_type ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (type: string) =>
    setSelected((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    );

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      // Keep the server's order, whatever order the boxes were ticked in.
      await onSave(
        connection,
        SLACK_ROUTING_TYPES.filter((type) => selected.includes(type)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not save the notification routing."));
      setSaving(false);
    }
  };

  return (
    <StandardModal
      isOpen
      onClose={() => !saving && onClose()}
      title="Notification routing"
      description={fill(t("Choose which notifications {channel} in {team} receives."), {
        channel: channelLabel(connection.channel),
        team: connection.team_name,
      })}
      onSubmit={handleSubmit}
      submitButtonText="Save"
      isSubmitting={saving}
      maxWidth="600px"
      fitContent
    >
      <Stack sx={{ gap: "16px" }}>
        {error && (
          <Alert severity="error" sx={{ fontSize: "13px" }}>
            {error}
          </Alert>
        )}
        {connection.delivery_scope === "user" && (
          <Typography sx={{ fontSize: "13px", color: "text.secondary" }}>
            Saving makes this connection post events for the whole organization, not only its
            owner's.
          </Typography>
        )}
        <Stack sx={{ gap: "12px" }}>
          {SLACK_ROUTING_TYPES.map((type) => (
            <Checkbox
              key={type}
              id={`slack-routing-${connection.id}-${type.replace(/\s+/g, "-").toLowerCase()}`}
              label={type}
              value={type}
              isChecked={selected.includes(type)}
              onChange={() => toggle(type)}
              isDisabled={saving}
            />
          ))}
        </Stack>
      </Stack>
    </StandardModal>
  );
}
