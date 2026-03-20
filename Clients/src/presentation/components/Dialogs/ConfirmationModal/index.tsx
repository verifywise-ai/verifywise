import { createPortal } from "react-dom";
import { CustomizableButton } from "../../button/customizable-button";
import { Stack, SxProps, Theme, Typography } from "@mui/material";
import {useModalKeyHandling} from "../../../../application/hooks/useModalKeyHandling";

interface ConfirmationModalProps {
  title: string;
  body: React.ReactNode;
  cancelText: string;
  proceedText: string;
  onCancel: () => void;
  onProceed: () => void;
  proceedButtonColor?:
    | "primary"
    | "secondary"
    | "success"
    | "warning"
    | "error"
    | "info";
  proceedButtonVariant: "contained" | "outlined" | "text";
  TitleFontSize?: number;
  confirmBtnSx?: SxProps<Theme> | undefined;
  isOpen?: boolean;
  isLoading?: boolean;
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
}) => {
  useModalKeyHandling({
    isOpen,
    onClose: onCancel,
  });

  if (!isOpen) return null;

  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return createPortal(
    <>
      <Stack
        className="confirmation-backdrop"
        onClick={onCancel}
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          zIndex: 1299,
          cursor: "default",
        }}
      />
      <Stack
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        aria-describedby="confirmation-modal-body"
        onClick={stopPropagation}
        sx={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 1300,
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
            isDisabled={isLoading}
          />
        </Stack>
      </Stack>
    </>,
    document.body
  );
};

export default ConfirmationModal;
