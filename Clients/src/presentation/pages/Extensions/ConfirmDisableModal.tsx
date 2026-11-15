import { Stack, Typography, useTheme } from "@mui/material";
import StandardModal from "../../components/Modals/StandardModal";
import { palette } from "../../themes/palette";
import { disableEffectFor } from "./disableCopy";

interface ConfirmDisableModalProps {
  isOpen: boolean;
  /** Extension key, picks the sentence that says what stops. */
  extensionKey: string;
  /** Shown as data, in its own element, so the copy around it stays static. */
  extensionName: string;
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation before an extension is disabled. Used by the catalog and the
 * settings page so both name the same effects.
 */
export default function ConfirmDisableModal({
  isOpen,
  extensionKey,
  extensionName,
  isSubmitting,
  onCancel,
  onConfirm,
}: ConfirmDisableModalProps) {
  const theme = useTheme();
  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onCancel}
      title="Disable this extension?"
      description="This applies to everyone in this organization."
      onSubmit={onConfirm}
      submitButtonText="Disable"
      cancelButtonText="Cancel"
      submitButtonColor={palette.status.error.text}
      isSubmitting={isSubmitting}
      fitContent
      maxWidth="480px"
    >
      <Stack spacing="8px">
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: theme.palette.text.primary }}>
          {extensionName}
        </Typography>
        <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
          {disableEffectFor(extensionKey)}
        </Typography>
      </Stack>
    </StandardModal>
  );
}
