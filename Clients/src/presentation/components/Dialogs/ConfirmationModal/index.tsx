import { CustomizableButton } from "../../button/customizable-button";
import { Modal, Stack, SxProps, Theme, Typography } from "@mui/material";

interface ConfirmationModalProps {
  title: string;
  body: React.ReactNode;
  cancelText: string;
  proceedText: string;
  onCancel: () => void;
  onProceed: () => void;
  proceedButtonColor?: "primary" | "secondary" | "success" | "warning" | "error" | "info";
  proceedButtonVariant: "contained" | "outlined" | "text";
  TitleFontSize?: number;
  confirmBtnSx?: SxProps<Theme> | undefined;
  isOpen?: boolean;
  /** The action is running: both buttons are disabled and the dialog cannot be closed. */
  isLoading?: boolean;
  /** Disables only the proceed button, for example while the dialog loads what it asks about. */
  isProceedDisabled?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  title,
  body,
  cancelText,
  proceedText,
  onCancel,
  onProceed,
  proceedButtonColor,
  proceedButtonVariant,
  TitleFontSize,
  confirmBtnSx,
  isOpen = true,
  isLoading = false,
  isProceedDisabled = false,
}) => {
  return (
    <Modal
      open={isOpen}
      // While the action runs, Escape and a backdrop click do nothing, like
      // the Cancel button, which is disabled then.
      onClose={isLoading ? undefined : onCancel}
      aria-labelledby="confirmation-modal-title"
      aria-describedby="confirmation-modal-body"
      slotProps={{
        backdrop: {
          className: "confirmation-backdrop",
        },
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 2,
      }}
    >
      <Stack
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        aria-describedby="confirmation-modal-body"
        sx={{
          bgcolor: "background.main",
          cursor: "default",
          width: 485,
          maxWidth: "calc(100vw - 32px)",
          borderRadius: 1,
          p: 8,
          boxShadow:
            "0px 8px 8px -4px rgba(16, 24, 40, 0.03), 0px 20px 24px -4px rgba(16, 24, 40, 0.08)",
          gap: 8,
          boxSizing: "border-box",
          outline: "none",
        }}
      >
        <Stack sx={{ gap: 8 }}>
          <Typography
            id="confirmation-modal-title"
            fontSize={TitleFontSize}
            sx={{ color: "text.secondary", fontWeight: "bolder" }}
          >
            {title}
          </Typography>
          <Stack id="confirmation-modal-body">{body}</Stack>
        </Stack>
        <Stack
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-end",
          }}
        >
          {cancelText && (
            <CustomizableButton
              text={cancelText}
              variant="text"
              sx={{ color: "text.secondary", px: "32px", width: 120 }}
              onClick={onCancel}
              isDisabled={isLoading}
            />
          )}
          <CustomizableButton
            text={isLoading ? "Processing..." : proceedText}
            color={proceedButtonColor}
            variant={proceedButtonVariant}
            onClick={onProceed}
            sx={confirmBtnSx}
            isDisabled={isLoading || isProceedDisabled}
          />
        </Stack>
      </Stack>
    </Modal>
  );
};

export default ConfirmationModal;
