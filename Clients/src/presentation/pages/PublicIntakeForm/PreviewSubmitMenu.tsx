import { Box, Popover, Typography, useTheme } from "@mui/material";
import { CheckCircle2 } from "lucide-react";
import { MenuOption } from "../IntakeFormBuilder/preview/PopoverMenu";

export type PreviewSubmitMode = "test" | "real";

interface PreviewSubmitMenuProps {
  anchor: HTMLElement | null;
  onClose: () => void;
  onChoose: (mode: PreviewSubmitMode) => void;
}

/**
 * In a builder's preview, Submit asks how to submit: a test that checks the
 * answers and sends nothing, or a real submission.
 */
export const PreviewSubmitMenu = ({ anchor, onClose, onChoose }: PreviewSubmitMenuProps) => {
  const theme = useTheme();
  return (
    <Popover
      open={Boolean(anchor)}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
      transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      slotProps={{
        paper: {
          sx: {
            mb: "4px",
            p: "4px",
            width: 340,
            borderRadius: "4px",
            border: `1px solid ${theme.palette.border.dark}`,
            boxShadow: theme.boxShadow,
          },
        },
      }}
    >
      <Box role="menu" aria-label="How to submit" data-testid="preview-submit-menu">
        <MenuOption
          label="Test submit"
          description="Checks your answers and sends nothing: no submission, no emails, no AI scoring."
          onSelect={() => onChoose("test")}
        />
        <MenuOption
          label="Submit for real"
          description="Creates a real submission, emails your reviewers and runs AI scoring if the form uses it."
          onSelect={() => onChoose("real")}
        />
      </Box>
    </Popover>
  );
};

/** Shown after a test submit that passed every check. */
export const TestSubmitPassed = () => {
  const theme = useTheme();
  const success = theme.palette.status.success;
  return (
    <Box
      role="status"
      data-testid="preview-test-submit-passed"
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: "8px",
        mb: "16px",
        p: "12px 16px",
        border: `1px solid ${success.border ?? theme.palette.border.dark}`,
        borderRadius: "4px",
        backgroundColor: success.bg ?? theme.palette.background.accent,
      }}
    >
      <CheckCircle2
        size={16}
        strokeWidth={1.5}
        color={success.text ?? theme.palette.text.secondary}
        style={{ flexShrink: 0, marginTop: 2 }}
      />
      <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary }}>
        Test submit passed. Nothing was sent.
      </Typography>
    </Box>
  );
};
