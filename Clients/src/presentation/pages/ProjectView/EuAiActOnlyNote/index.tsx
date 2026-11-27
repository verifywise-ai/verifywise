import { Box, Typography } from "@mui/material";
import { Info } from "lucide-react";
import { useNavigate } from "react-router";
import { useCanCheck } from "../../../../application/hooks/useCan";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { note, radiusPx } from "../../../themes/palette";
import { fontSize } from "../../../themes/typography";

interface EuAiActOnlyNoteProps {
  projectId: string;
  /** The organizational use case can never take the EU AI Act. */
  isOrganizational: boolean;
  /** False when the saved-work check failed and the tab is shown anyway. */
  workConfirmed: boolean;
}

// Whole sentences, so each one is a single translation key.
const MESSAGES = {
  useCase: {
    confirmed: "Applies when the EU AI Act is added. This tab stays because it holds saved work.",
    unconfirmed: "Applies when the EU AI Act is added.",
  },
  organizational: {
    confirmed:
      "Applies to use cases with the EU AI Act. This tab stays because it holds saved work.",
    unconfirmed: "Applies to use cases with the EU AI Act.",
  },
} as const;

/**
 * Shown on the FRIA and CE marking tabs of a use case without the EU AI Act.
 * Those tabs only stay on such a use case when they already hold work (or the
 * check failed), so the note says why the tab is there. On a regular use case,
 * roles that can manage frameworks get a button that opens the add framework
 * dialog; the organizational use case cannot take the EU AI Act, so it gets
 * none.
 */
const EuAiActOnlyNote = ({ projectId, isOrganizational, workConfirmed }: EuAiActOnlyNoteProps) => {
  const navigate = useNavigate();
  const can = useCanCheck();
  const message =
    MESSAGES[isOrganizational ? "organizational" : "useCase"][
      workConfirmed ? "confirmed" : "unconfirmed"
    ];

  return (
    <Box
      role="status"
      data-testid="note-eu-ai-act-only"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
        padding: "10px 12px",
        mb: "16px",
        background: note.bg,
        border: `1px solid ${note.border}`,
        borderRadius: radiusPx.sm,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Info size={16} strokeWidth={1.5} color={note.text} aria-hidden />
        <Typography sx={{ fontSize: fontSize.base, color: note.text, lineHeight: 1.5 }}>
          {message}
        </Typography>
      </Box>
      {!isOrganizational && can("framework.edit") && (
        <CustomizableButton
          variant="outlined"
          text="Add EU AI Act"
          testId="add-eu-ai-act"
          onClick={() =>
            navigate(`/project-view?projectId=${projectId}&tab=frameworks&addFramework=1`)
          }
        />
      )}
    </Box>
  );
};

export default EuAiActOnlyNote;
