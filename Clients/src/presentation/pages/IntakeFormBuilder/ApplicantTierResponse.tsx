import { Box, Typography, useTheme } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { getSubmissionTierSuggestionResponse } from "../../../application/repository/intakeTierSuggestion.repository";

/**
 * What the applicant said about the risk level suggested to them before they
 * submitted (#5190), shown next to the EU AI Act classification. Nothing is
 * shown when they gave no response.
 */
const ApplicantTierResponse = ({ submissionId }: { submissionId: number }) => {
  const theme = useTheme();
  const { data: response } = useQuery({
    queryKey: ["intakeTierSuggestionResponse", submissionId],
    queryFn: () => getSubmissionTierSuggestionResponse(submissionId),
    staleTime: 60 * 1000,
  });
  if (!response) return null;

  return (
    <Box
      data-testid="applicant-tier-response"
      sx={{
        border: `1px solid ${theme.palette.border.dark}`,
        borderRadius: "4px",
        p: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <Typography sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.primary }}>
        Applicant's response to the suggested level
      </Typography>
      <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
        <span>Suggested:</span> <span>{response.suggestedLevel}</span>
      </Typography>
      {response.accepted ? (
        <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
          Accepted the suggestion
        </Typography>
      ) : (
        <>
          <Typography sx={{ fontSize: "13px", color: theme.palette.text.secondary }}>
            Added context
          </Typography>
          {response.context && (
            <Typography
              data-testid="applicant-tier-context"
              sx={{ fontSize: "13px", color: theme.palette.text.primary, whiteSpace: "pre-wrap" }}
            >
              {response.context}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
};

export default ApplicantTierResponse;
