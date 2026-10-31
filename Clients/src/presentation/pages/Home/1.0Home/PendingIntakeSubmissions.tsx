import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { singleTheme } from "../../../themes";
import useNavigateSearch from "../../../../application/hooks/useNavigateSearch";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";
import type { PendingUseCaseSubmission } from "../../../../application/repository/useCaseLifecycle.repository";

const COLUMNS = ["Request", "Intake form", "Submitted by", "Submitted", "Days in review", ""];

const cellSx = { ...singleTheme.tableStyles.primary.body.cell, fontSize: "13px" };

/**
 * Use case intake submissions waiting for a decision, shown in the In review
 * tab (#5188). No use case exists yet: approving the submission creates it,
 * so each row opens the existing submission review screen.
 */
const PendingIntakeSubmissions = ({ submissions }: { submissions: PendingUseCaseSubmission[] }) => {
  const navigateSearch = useNavigateSearch();
  const formatDate = useFormattedDate();

  if (submissions.length === 0) return null;

  const openReview = (id: number) =>
    navigateSearch("/intake-forms/submissions", { submission: String(id) });

  return (
    <Stack sx={{ gap: "8px", mb: "24px" }} data-testid="pending-intake-submissions">
      <Box>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Intake requests</Typography>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          Submitted through an intake form. The use case is created when a reviewer approves the
          request.
        </Typography>
      </Box>
      <TableContainer>
        <Table sx={singleTheme.tableStyles.primary.frame}>
          <TableHead>
            <TableRow sx={singleTheme.tableStyles.primary.header.row}>
              {COLUMNS.map((label, index) => (
                <TableCell key={index} sx={singleTheme.tableStyles.primary.header.cell}>
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {submissions.map((submission) => (
              <TableRow key={submission.id} data-testid="pending-intake-submission-row">
                <TableCell sx={{ ...cellSx, fontWeight: 500 }}>
                  {submission.title ?? (
                    <Box component="span" sx={{ color: "text.secondary" }}>
                      Untitled request
                    </Box>
                  )}
                </TableCell>
                <TableCell sx={cellSx}>{submission.form_name}</TableCell>
                <TableCell sx={cellSx}>{submission.submitter_name || "-"}</TableCell>
                <TableCell sx={cellSx}>{formatDate(submission.submitted_at)}</TableCell>
                <TableCell sx={cellSx}>{submission.days_in_review}</TableCell>
                <TableCell sx={{ ...cellSx, textAlign: "right" }}>
                  <CustomizableButton
                    variant="outlined"
                    text="Review"
                    testId={`pending-intake-review-${submission.id}`}
                    onClick={() => openReview(submission.id)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
};

export default PendingIntakeSubmissions;
