import { useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { PanelRightOpen, ShieldCheck } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import { useEuAiActQuestionnaire } from "../../../application/hooks/useEuAiActQuestionnaire";
import { EuAiActQuestionnaireDrawer } from "./EuAiActQuestionnaireDrawer";

/**
 * Read-only preview of the EU AI Act risk step in the builder canvas. The step
 * is not part of the form schema: submitters answer it before the form's
 * questions, so it sits above them and cannot be edited or moved. The
 * questions open read-only in a side drawer.
 */
export function EuAiActStepCard() {
  const theme = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data, isFetching, isError, refetch } = useEuAiActQuestionnaire();
  const questions = data?.questions ?? [];
  // React Query v5 keeps isError set while a retry runs and after a failed
  // background refetch, so loading and error only show when there is no data.
  const showLoading = isFetching && !data;
  const showError = isError && !data && !isFetching;

  return (
    <Box
      data-testid="eu-ai-act-step-card"
      onClick={(e) => e.stopPropagation()}
      sx={{
        px: "24px",
        py: "16px",
        borderBottom: `1px solid ${theme.palette.border.light}`,
        backgroundColor: theme.palette.background.fill,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <Box sx={{ color: theme.palette.primary.main, display: "flex", mt: "2px" }}>
          <ShieldCheck size={16} strokeWidth={1.5} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "14px", fontWeight: 600, color: theme.palette.text.primary }}>
            EU AI Act risk classification
          </Typography>
          <Typography sx={{ fontSize: "12px", color: theme.palette.text.secondary, mt: "2px" }}>
            Submitters answer these questions first. The result is shown only to reviewers.
          </Typography>
          {showLoading && (
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent, mt: "4px" }}>
              Loading questions...
            </Typography>
          )}
          {showError && (
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent, mt: "4px" }}>
              The questions could not be loaded.
            </Typography>
          )}
          {data && (
            <Typography sx={{ fontSize: "12px", color: theme.palette.text.accent, mt: "4px" }}>
              <span>Questions</span>
              {` (${questions.length})`}
            </Typography>
          )}
        </Box>
        <CustomizableButton
          variant="outlined"
          size="small"
          text="View questions"
          startIcon={<PanelRightOpen size={14} strokeWidth={1.5} />}
          onClick={() => setDrawerOpen(true)}
          aria-haspopup="dialog"
        />
      </Box>
      <EuAiActQuestionnaireDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        questionnaire={data}
        isLoading={showLoading}
        isError={showError}
        isRetryDisabled={isFetching}
        onRetry={() => void refetch()}
      />
    </Box>
  );
}

export default EuAiActStepCard;
