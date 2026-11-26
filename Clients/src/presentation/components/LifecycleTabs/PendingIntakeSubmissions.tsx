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
import { CustomizableButton } from "../button/customizable-button";
import { singleTheme } from "../../themes";
import useNavigateSearch from "../../../application/hooks/useNavigateSearch";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import type { PendingIntakeSubmissions as PendingRequests } from "../../../application/repository/useCaseLifecycle.repository";

const COLUMNS = ["Request", "Intake form", "Submitted by", "Submitted", "Days in review", ""];

const cellSx = { ...singleTheme.tableStyles.primary.body.cell, fontSize: "13px" };

// The row divider of the house table. The rows themselves are not clickable
// (the Review button is), so the pointer cursor of the house row is dropped;
// the hover highlight stays, to help follow a row across the columns.
const rowSx = { ...singleTheme.tableStyles.primary.body.row, "&:hover": { cursor: "default" } };

const SectionHeading = ({ title, description }: { title: string; description: string }) => (
  <Box>
    <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>
    <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{description}</Typography>
  </Box>
);

/**
 * Intake submissions waiting for a decision, shown in an In review tab (use
 * cases #5188, AI apps #5193). Nothing exists in the inventory yet: approving
 * the submission creates it, so each row opens the submission review screen.
 */
const PendingIntakeSubmissions = ({
  pending,
  searchTerm = "",
  description,
  exportNote,
  listHeading,
}: {
  pending: PendingRequests | undefined;
  /** The list's search box; matches the title, form name and submitter. */
  searchTerm?: string;
  /** What approving a request creates. */
  description: string;
  /** Shown under the table when the page exports its list without the requests. */
  exportNote?: string;
  /**
   * Heading for the page's own list, which follows this block. Shown only
   * with requests: without them the list is the only thing in the tab.
   */
  listHeading?: { title: string; description: string };
}) => {
  const navigateSearch = useNavigateSearch();
  const formatDate = useFormattedDate();

  if (!pending || pending.total === 0) return null;

  const term = searchTerm.trim().toLowerCase();
  const submissions = term
    ? pending.items.filter((s) =>
        [s.title, s.form_name, s.submitter_name].some((v) => v?.toLowerCase().includes(term)),
      )
    : pending.items;
  const isCapped = pending.total > pending.items.length;

  const openReview = (id: number) =>
    navigateSearch("/intake-forms/submissions", { submission: String(id) });

  return (
    <>
      <Stack sx={{ gap: "8px", mb: "24px" }} data-testid="pending-intake-submissions">
        <SectionHeading title="Intake requests" description={description} />
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
                <TableRow
                  key={submission.id}
                  sx={rowSx}
                  data-testid="pending-intake-submission-row"
                >
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
        {submissions.length === 0 && (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            No intake requests match your search.
          </Typography>
        )}
        {isCapped && (
          <Typography
            sx={{ fontSize: 13, color: "text.secondary" }}
            data-testid="pending-intake-capped"
          >
            <span>Showing the oldest</span> <span>{pending.items.length}</span> <span>of</span>{" "}
            <span>{pending.total}</span>
          </Typography>
        )}
        {exportNote && (
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{exportNote}</Typography>
        )}
      </Stack>
      {listHeading && (
        <Box sx={{ mb: "8px" }} data-testid="pending-intake-list-heading">
          <SectionHeading {...listHeading} />
        </Box>
      )}
    </>
  );
};

export default PendingIntakeSubmissions;
