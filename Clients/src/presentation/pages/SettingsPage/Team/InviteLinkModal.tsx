import React, { useEffect, useState } from "react";
import { Stack, Typography } from "@mui/material";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";

export interface InviteLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Registration link to hand to the invitee. */
  link: string;
  /** Explanation shown above the link. */
  message: string;
}

type CopyState = "idle" | "copied" | "failed";

/**
 * Shown when the invitation email could not be sent. The link stays on screen
 * until the admin dismisses it, so it can be selected or copied.
 */
const InviteLinkModal: React.FC<InviteLinkModalProps> = ({ isOpen, onClose, link, message }) => {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  // A new link is a new copy; reset the button state.
  useEffect(() => {
    setCopyState("idle");
  }, [link]);

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(link);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title="Share the invitation link"
      description="The invitation email could not be sent"
      onSubmit={handleCopy}
      submitButtonText={copyState === "copied" ? "Copied" : "Copy link"}
      cancelButtonText="Done"
      maxWidth="560px"
      fitContent
    >
      <Stack sx={{ gap: "16px" }}>
        <Typography sx={{ fontSize: "13px", color: "text.secondary" }}>{message}</Typography>
        <Field
          id="invite-fallback-link"
          label="Invitation link"
          value={link}
          multiline
          minRows={4}
          InputProps={{ readOnly: true }}
          onFocus={(event) => event.target.select()}
        />
        {copyState === "failed" && (
          <Typography role="alert" sx={{ fontSize: "13px", color: "error.main" }}>
            Could not copy the link. Select it and copy it manually.
          </Typography>
        )}
      </Stack>
    </StandardModal>
  );
};

export default InviteLinkModal;
