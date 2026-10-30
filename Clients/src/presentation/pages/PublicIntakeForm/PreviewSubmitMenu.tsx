import type { KeyboardEvent } from "react";
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
  // Arrow keys move between the choices.
  const moveFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(at + step + items.length) % items.length]?.focus();
  };
  return (
    <Popover
      open={Boolean(anchor)}
      anchorEl={anchor}
      onClose={onClose}
      // Focus the first choice once open, as a menu does.
      TransitionProps={{
        onEntered: (node: HTMLElement) =>
          node.querySelector<HTMLElement>('[role="menuitem"]')?.focus(),
      }}
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
      <Box
        role="menu"
        aria-label="How to submit"
        data-testid="preview-submit-menu"
        onKeyDown={moveFocus}
      >
        <MenuOption
          label="Test submit"
          description="Runs the checks on this page and sends nothing: no submission, no emails, no AI scoring."
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
        border: `1px solid ${success.border}`,
        borderRadius: "4px",
        backgroundColor: success.bg,
      }}
    >
      <CheckCircle2
        size={16}
        strokeWidth={1.5}
        color={success.text}
        style={{ flexShrink: 0, marginTop: 2 }}
      />
      <Typography sx={{ fontSize: "13px", color: theme.palette.text.primary }}>
        Test submit passed the checks on this page. Nothing was sent. The captcha answer and the
        server checks only run on a real submit.
      </Typography>
    </Box>
  );
};
