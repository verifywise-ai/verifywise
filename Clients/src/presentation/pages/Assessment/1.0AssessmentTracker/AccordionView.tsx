import { useCallback, useState, useMemo } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
  Chip,
  Tooltip,
  Popover,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import { ArrowRight as RightArrowBlack, ChevronDown } from "lucide-react";
import { Subtopic } from "../../../../domain/types/Subtopic";
import { Question } from "../../../../domain/types/Question";
import { styles, getPriorityColors } from "./euaiact.style";
import { getStatusColor } from "../../ISO/style";
import { updateEUAIActQuestionStatus } from "../../../../application/repository/euaiact.repository";
import { useAuth } from "../../../../application/hooks/useAuth";
import { handleAlert } from "../../../../application/tools/alertUtils";
import Alert from "../../../components/Alert";
import { AlertProps } from "../../../types/alert.types";
import { background } from "../../../themes/palette";

interface AccordionViewProps {
  subtopics: Array<Subtopic & { questions?: Question[] }>;
  statusFilter?: string;
  onQuestionClick: (question: Question, subtopic: Subtopic) => void;
  flashingQuestionId?: number | null;
  onStatusUpdate?: () => void;
  expanded?: number | false;
  onExpandedChange?: (expanded: number | false) => void;
  onFlashingChange?: (questionId: number | null) => void;
}

/**
 * EU AI Act Status Dropdown Component
 * Custom dropdown showing only 3 status options with colored styling
 * Replaces StatusDropdown to enforce EU AI Act status constraints
 */
interface EUAIActStatusDropdownProps {
  currentStatus: string;
  onStatusChange: (status: string) => Promise<boolean>;
  disabled: boolean;
}

const EUAIActStatusDropdown = ({
  currentStatus,
  onStatusChange,
  disabled,
}: EUAIActStatusDropdownProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const statusOptions = ["Not started", "In progress", "Done"];
  const statusColor = getStatusColor(currentStatus || "Not started");

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      await onStatusChange(newStatus);
    } finally {
      setIsUpdating(false);
      setAnchorEl(null);
    }
  };

  return (
    <>
      <Box
        onClick={(e) => !disabled && setAnchorEl(e.currentTarget)}
        sx={{
          backgroundColor: statusColor,
          color: `${background.main}`,
          fontSize: 12,
          fontWeight: 500,
          padding: "4px 8px",
          borderRadius: "4px",
          cursor: disabled ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "4px",
          minWidth: "100px",
          transition: "opacity 200ms ease",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {isUpdating && <CircularProgress size={10} sx={{ color: `${background.main}` }} />}
          <span>{currentStatus || "Not started"}</span>
        </Box>
        {!isUpdating && <ChevronDown size={14} />}
      </Box>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        sx={{ mt: "4px" }}
      >
        <Stack sx={{ py: "4px" }}>
          {statusOptions.map((status) => (
            <MenuItem
              key={status}
              onClick={() => handleStatusChange(status)}
              sx={{
                fontSize: 13,
                minWidth: "150px",
                backgroundColor:
                  status === currentStatus ? "#f0f0f0" : "transparent",
              }}
            >
              {status}
            </MenuItem>
          ))}
        </Stack>
      </Popover>
    </>
  );
};

const AccordionView = ({
  subtopics,
  statusFilter,
  onQuestionClick,
  flashingQuestionId,
  onStatusUpdate,
  expanded: _expandedProp,
  onExpandedChange: _onExpandedChange,
  onFlashingChange,
}: AccordionViewProps) => {
  const { userId } = useAuth();
  // Track multiple expanded accordions - default to all expanded
  const [expandedSet, setExpandedSet] = useState<Set<number>>(() => {
    // Initialize with all subtopic IDs to expand all by default
    return new Set(subtopics.map(s => s.id ?? 0));
  });
  const [updatingQuestionId, setUpdatingQuestionId] = useState<number | null>(
    null
  );
  const [alert, setAlert] = useState<AlertProps | null>(null);

  /**
   * Handle status change for a question
   * Updates the status via API and triggers parent refresh
   */
  const handleStatusChange = useCallback(
    async (question: Question, newStatus: string): Promise<boolean> => {
      try {
        setUpdatingQuestionId(question.question_id || null);

        const success = await updateEUAIActQuestionStatus({
          answerId: question.answer_id,
          newStatus,
          userId: userId || 1,
        });

        if (success) {
          // Show success alert with status-specific message
          const statusMessages: { [key: string]: string } = {
            "Not started": "Status updated to 'Not started'",
            "In progress": "Status updated to 'In progress'",
            Done: "Status updated to 'Done'",
          };
          handleAlert({
            variant: "success",
            body: statusMessages[newStatus] || "Status updated successfully",
            setAlert,
          });

          // Trigger green flash effect
          if (onFlashingChange && question.question_id) {
            onFlashingChange(question.question_id);
            setTimeout(() => {
              onFlashingChange(null);
            }, 2000);
          }

          // Refresh data
          if (onStatusUpdate) {
            onStatusUpdate();
          }
        } else {
          handleAlert({
            variant: "error",
            body: "Failed to update status. Please try again.",
            setAlert,
          });
        }

        return success;
      } catch (error) {
        console.error("Error updating question status:", error);
        handleAlert({
          variant: "error",
          body:
            error instanceof Error
              ? `Error updating status: ${error.message}`
              : "An error occurred while updating status",
          setAlert,
        });
        return false;
      } finally {
        setUpdatingQuestionId(null);
      }
    },
    [userId, onStatusUpdate, onFlashingChange]
  );

  /**
   * Priority Chip Component
   * Displays priority level with color coding
   */
  const PriorityChip = ({ priority }: { priority: string }) => {
    const colors = getPriorityColors(priority);

    return (
      <Chip
        label={priority || "Unknown"}
        size="small"
        sx={{
          backgroundColor: colors.bg,
          color: colors.text,
          fontSize: 12,
          fontWeight: 500,
          height: 24,
          borderRadius: "4px",
          textTransform: "capitalize",
          "& .MuiChip-label": { px: "8px" },
          marginRight: "8px",
        }}
      />
    );
  };

  // Filter questions based on status
  const filterQuestions = useCallback(
    (questions: Question[]) => {
      let filtered = questions;
      if (statusFilter && statusFilter !== "") {
        filtered = filtered.filter(
          (q) => q.status?.toLowerCase() === statusFilter.toLowerCase()
        );
      }
      return filtered;
    },
    [statusFilter]
  );

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return !!(statusFilter && statusFilter !== "");
  }, [statusFilter]);

  // Calculate filtered count for all subtopics
  const filteredCountsMemo = useMemo(() => {
    const counts: { [key: number]: number } = {};
    subtopics.forEach((subtopic) => {
      const filtered = filterQuestions(subtopic.questions || []);
      counts[subtopic.id ?? 0] = filtered.length;
    });
    return counts;
  }, [subtopics, filterQuestions]);

  const handleAccordionChange = (subtopicId: number) => {
    setExpandedSet(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subtopicId)) {
        newSet.delete(subtopicId);
      } else {
        newSet.add(subtopicId);
      }
      return newSet;
    });
  };

  return (
    <>
      {alert && (
        <Alert {...alert} isToast={true} onClick={() => setAlert(null)} />
      )}
      <Stack sx={{ gap: 2 }}>
        {subtopics.map((subtopic) => {
          const filteredQuestions = filterQuestions(subtopic.questions || []);

          return (
            <Accordion
              key={subtopic.id}
              expanded={expandedSet.has(subtopic.id ?? 0)}
              onChange={() => handleAccordionChange(subtopic.id ?? 0)}
              sx={{
                ...styles.accordion,
                "&:before": {
                  display: "none",
                },
              }}
            >
              <AccordionSummary
                sx={{
                  ...styles.accordionSummary,
                  borderBottom:
                    expandedSet.has(subtopic.id ?? 0) ? "1px solid #d0d5dd" : "none",
                }}
              >
                {/* Arrow Icon */}
                <RightArrowBlack
                  size={16}
                  style={
                    styles.expandIcon(
                      expandedSet.has(subtopic.id ?? 0)
                    ) as React.CSSProperties
                  }
                />

                {/* Title */}
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                  {subtopic.title}
                </Typography>

                {/* Filter Count Badge */}
                {hasActiveFilters &&
                  filteredCountsMemo[subtopic.id ?? 0] > 0 && (
                    <Box component="span" sx={{ ml: "auto" }}>
                      <Chip
                        label={`${
                          filteredCountsMemo[subtopic.id ?? 0]
                        } filtered`}
                        size="small"
                        sx={{
                          height: "20px",
                          fontSize: "12px",
                          backgroundColor: "#f0f0f0",
                          color: "text.secondary",
                        }}
                      />
                    </Box>
                  )}
              </AccordionSummary>

              <AccordionDetails sx={{ padding: 0 }}>
                {filteredQuestions.length > 0 ? (
                  filteredQuestions.map((question, index) => (
                    <Stack
                      key={question.question_id}
                      onClick={() => onQuestionClick(question, subtopic)}
                      sx={styles.questionRow(
                        index === filteredQuestions.length - 1,
                        flashingQuestionId === question.question_id
                      )}
                    >
                      {/* Left side: Question text with tooltip */}
                      <Tooltip
                        title={question.question}
                        arrow
                        placement="top"
                        enterDelay={500}
                      >
                        <Typography sx={styles.questionText}>
                          {question.question}
                        </Typography>
                      </Tooltip>

                      {/* Right side: Priority chip + Status dropdown */}
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexShrink: 0,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PriorityChip priority={question.priority_level} />

                        <EUAIActStatusDropdown
                          currentStatus={question.status || "Not started"}
                          onStatusChange={(newStatus) =>
                            handleStatusChange(question, newStatus)
                          }
                          disabled={updatingQuestionId === question.question_id}
                        />
                      </Box>
                    </Stack>
                  ))
                ) : (
                  <Box sx={{ padding: "16px" }}>
                    <Typography sx={{ fontSize: 13, color: "#666" }}>
                      No questions match the selected filters
                    </Typography>
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
    </>
  );
};

export default AccordionView;
