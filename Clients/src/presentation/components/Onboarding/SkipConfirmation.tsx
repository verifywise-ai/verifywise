import React from "react";
import { Button, Modal, Stack, Typography, useTheme } from "@mui/material";
import { SkipForward } from "lucide-react";
import { SKIP_CONFIRMATION_TEXT } from "./onboardingConstants";
import { useModalKeyHandling } from "../../../application/hooks/useModalKeyHandling";
import { brand } from "../../themes/palette";

interface SkipConfirmationProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const SkipConfirmation: React.FC<SkipConfirmationProps> = ({
  open,
  onConfirm,
  onCancel,
}) => {
  const theme = useTheme();

  useModalKeyHandling({
    isOpen: open,
    onClose: onCancel,
  });

  return (
    <Modal
      open={open}
      onClose={(_event, reason) => {
        if (reason !== "backdropClick") {
          onCancel();
        }
      }}
      sx={{
        zIndex: 10001,
      }}
    >
      <Stack
        gap={theme.spacing(2)}
        color={theme.palette.text.secondary}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 450,
          bgcolor: theme.palette.background.modal,
          border: 1,
          borderColor: theme.palette.border.dark,
          borderRadius: theme.shape.borderRadius,
          boxShadow: 24,
          p: theme.spacing(15),
          "&:focus": {
            outline: "none",
          },
        }}
      >
        <Typography
          id="modal-skip-onboarding"
          fontSize={16}
          fontWeight={600}
        >
          {SKIP_CONFIRMATION_TEXT.title}
        </Typography>
        <Typography
          id="skip-onboarding-confirmation"
          fontSize={13}
          textAlign={"left"}
        >
          {SKIP_CONFIRMATION_TEXT.message}
        </Typography>
        <Stack
          direction="row"
          gap={theme.spacing(4)}
          mt={theme.spacing(12)}
          justifyContent="flex-end"
        >
          <Button
            disableRipple
            disableFocusRipple
            disableTouchRipple
            variant="text"
            color="inherit"
            onClick={onCancel}
            sx={{
              borderRadius: theme.shape.borderRadius,
              fontSize: 13,
              fontWeight: 500,
              textTransform: "none",
              "&:hover": {
                backgroundColor: "transparent",
              },
            }}
          >
            {SKIP_CONFIRMATION_TEXT.cancelButton}
          </Button>
          <Button
            disableRipple
            disableFocusRipple
            disableTouchRipple
            variant="contained"
            startIcon={<SkipForward size={16} />}
            onClick={onConfirm}
            sx={{
              borderRadius: theme.shape.borderRadius,
              fontSize: 13,
              fontWeight: 500,
              textTransform: "none",
              backgroundColor: `${brand.primary}`,
              "&:hover": {
                backgroundColor: `${brand.primaryHover}`,
              },
            }}
          >
            {SKIP_CONFIRMATION_TEXT.confirmButton}
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
};

export default SkipConfirmation;
