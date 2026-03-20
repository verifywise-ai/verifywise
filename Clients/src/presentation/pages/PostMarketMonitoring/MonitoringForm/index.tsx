/**
 * Monitoring Form Page
 *
 * Page for stakeholders to complete a monitoring cycle.
 * Displays questions and collects responses with autosave functionality.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Stack,
  Typography,
  Radio,
  RadioGroup,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  useTheme,
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle, Clock, Flag } from "lucide-react";
import { PageBreadcrumbs } from "../../../components/breadcrumbs/PageBreadcrumbs";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Field from "../../../components/Inputs/Field";
import Alert from "../../../components/Alert";
import { pmmService } from "../../../../infrastructure/api/postMarketMonitoringService";
import {
  PMMCycleWithDetails,
  PMMQuestion,
  PMMResponseSave,
} from "../../../../domain/types/PostMarketMonitoring";
import dayjs from "dayjs";
import { AlertState } from "../../../../application/interfaces/appStates";
import { brand } from "../../../themes/palette";

interface LocalAlertState extends AlertState {
  isToast: boolean;
  visible: boolean;
}

const MonitoringForm: React.FC = () => {
  const theme = useTheme();
  const { cycleId } = useParams<{ cycleId: string }>();
  const navigate = useNavigate();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cycle, setCycle] = useState<PMMCycleWithDetails | null>(null);
  const [questions, setQuestions] = useState<PMMQuestion[]>([]);
  const [responses, setResponses] = useState<Record<number, boolean | string | string[]>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(
    new Set()
  );
  const [alert, setAlert] = useState<LocalAlertState | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load cycle data and questions
  useEffect(() => {
    const loadData = async () => {
      if (!cycleId) return;

      setIsLoading(true);
      try {
        const cycleData = await pmmService.getCycleById(parseInt(cycleId, 10));
        setCycle(cycleData);

        // Load questions for this config
        const questionsData = await pmmService.getQuestions(cycleData.config_id);
        setQuestions(questionsData.sort((a, b) => a.display_order - b.display_order));

        // Load existing responses if any (partial save)
        try {
          const existingResponses = await pmmService.getResponses(parseInt(cycleId, 10));
          if (existingResponses && existingResponses.length > 0) {
            const responsesMap: Record<number, boolean | string | string[]> = {};
            const flaggedSet = new Set<number>();

            existingResponses.forEach((response) => {
              responsesMap[response.question_id] = response.response_value;
              if (response.is_flagged) {
                flaggedSet.add(response.question_id);
              }
            });

            setResponses(responsesMap);
            setFlaggedQuestions(flaggedSet);
          }
        } catch (responseError) {
          // Don't fail if we can't load responses - form will just be empty
          console.warn("Could not load existing responses:", responseError);
        }
      } catch (error) {
        console.error("Error loading monitoring form:", error);
        showAlert("error", "Failed to load monitoring form");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  const showAlert = useCallback(
    (variant: LocalAlertState["variant"], body: string, title?: string) => {
      setAlert({ variant, body, title, isToast: true, visible: true });
      setTimeout(() => setAlert(null), 3000);
    },
    []
  );

  // Update response for a question
  const handleResponseChange = useCallback(
    (questionId: number, value: boolean | string | string[]) => {
      setResponses((prev) => ({
        ...prev,
        [questionId]: value,
      }));
    },
    []
  );

  // Toggle flag for a question
  const handleToggleFlag = useCallback((questionId: number) => {
    setFlaggedQuestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  }, []);

  // Save draft (autosave)
  const handleSaveDraft = useCallback(async () => {
    if (!cycleId) return;

    const responsesToSave: PMMResponseSave[] = Object.entries(responses)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([questionId, value]) => ({
        question_id: parseInt(questionId, 10),
        response_value: value,
        is_flagged: flaggedQuestions.has(parseInt(questionId, 10)),
      }));

    if (responsesToSave.length === 0) return;

    setIsSaving(true);
    try {
      await pmmService.saveResponses(parseInt(cycleId, 10), responsesToSave);
      setLastSaved(new Date());
    } catch (error) {
      console.error("Error saving draft:", error);
      showAlert("warning", "Draft could not be saved. Your changes may not be preserved.");
    } finally {
      setIsSaving(false);
    }
  }, [cycleId, responses, flaggedQuestions, showAlert]);

  // Submit form
  const handleSubmit = useCallback(async () => {
    if (!cycleId) return;

    // Validate required questions
    const requiredQuestions = questions.filter((q) => q.is_required);
    const missingRequired = requiredQuestions.filter(
      (q) =>
        responses[q.id!] === undefined ||
        responses[q.id!] === null ||
        responses[q.id!] === ""
    );

    if (missingRequired.length > 0) {
      showAlert(
        "error",
        `Please answer all required questions (${missingRequired.length} remaining)`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const responsesToSubmit: PMMResponseSave[] = Object.entries(responses).map(
        ([questionId, value]) => ({
          question_id: parseInt(questionId, 10),
          response_value: value,
          is_flagged: flaggedQuestions.has(parseInt(questionId, 10)),
        })
      );

      await pmmService.submitCycle(parseInt(cycleId, 10), {
        responses: responsesToSubmit,
      });

      showAlert("success", "Monitoring cycle completed successfully");

      // Redirect after a short delay
      setTimeout(() => {
        navigate(-1);
      }, 1500);
    } catch (error) {
      console.error("Error submitting form:", error);
      const errorMessage =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || "Failed to submit monitoring form";
      showAlert("error", errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [cycleId, questions, responses, flaggedQuestions, showAlert, navigate]);

  // Calculate completion percentage
  const completionPercent = useMemo(() => {
    const requiredQuestions = questions.filter((q) => q.is_required);
    if (requiredQuestions.length === 0) return 100;

    const answeredRequired = requiredQuestions.filter(
      (q) =>
        responses[q.id!] !== undefined &&
        responses[q.id!] !== null &&
        responses[q.id!] !== ""
    );
    return Math.round((answeredRequired.length / requiredQuestions.length) * 100);
  }, [questions, responses]);

  // Check if cycle is already completed
  const isCompleted = cycle?.status === "completed";
  const isOverdue = cycle?.is_overdue;

  // Styles
  const cardStyle = {
    backgroundColor: theme.palette.background.main,
    border: `1px solid ${theme.palette.border.dark}`,
    borderRadius: "4px",
    padding: "24px",
  };

  if (isLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" minHeight={400}>
        <CircularProgress size={40} />
      </Stack>
    );
  }

  if (!cycle) {
    return (
      <Stack alignItems="center" justifyContent="center" minHeight={400}>
        <Typography sx={{ fontSize: 14, color: theme.palette.other.icon }}>
          Monitoring cycle not found
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack>
      <PageBreadcrumbs showDivider={false} />

      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}

      {/* Header */}
      <Stack spacing={1} mb={4}>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.palette.text.primary }}>
          Post-market monitoring
        </Typography>
        <Typography sx={{ fontSize: 13, color: theme.palette.other.icon }}>
          {cycle.project_title} - Cycle #{cycle.cycle_number}
        </Typography>
      </Stack>

      {/* Status Card */}
      <Box sx={{ ...cardStyle, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={4} alignItems="center">
            {/* Status */}
            <Stack direction="row" spacing={1} alignItems="center">
              {isCompleted ? (
                <CheckCircle size={16} color={theme.palette.status.success.main} />
              ) : isOverdue ? (
                <AlertTriangle size={16} color={theme.palette.status.warning.main} />
              ) : (
                <Clock size={16} color={theme.palette.other.icon} />
              )}
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                {isCompleted
                  ? "Completed"
                  : isOverdue
                  ? "Overdue"
                  : "In progress"}
              </Typography>
            </Stack>

            {/* Due date */}
            <Stack>
              <Typography sx={{ fontSize: 11, color: theme.palette.other.icon }}>
                Due date
              </Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                {dayjs(cycle.due_at).format("MMM D, YYYY")}
              </Typography>
            </Stack>

            {/* Completion */}
            <Stack>
              <Typography sx={{ fontSize: 11, color: theme.palette.other.icon }}>
                Completion
              </Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                {completionPercent}%
              </Typography>
            </Stack>
          </Stack>

          {/* Autosave indicator */}
          {lastSaved && (
            <Typography sx={{ fontSize: 11, color: theme.palette.other.icon }}>
              Last saved: {dayjs(lastSaved).format("HH:mm:ss")}
            </Typography>
          )}
        </Stack>
      </Box>

      {/* Completed message */}
      {isCompleted && (
        <Box
          sx={{
            ...cardStyle,
            mb: 3,
            backgroundColor: theme.palette.status.success.bg,
            border: `1px solid ${theme.palette.status.success.light}`,
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <CheckCircle size={20} color={theme.palette.status.success.main} />
            <Typography sx={{ fontSize: 13, color: theme.palette.status.success.text }}>
              This monitoring cycle was completed on{" "}
              {dayjs(cycle.completed_at).format("MMMM D, YYYY")}
              {cycle.completed_by_name && ` by ${cycle.completed_by_name}`}.
            </Typography>
          </Stack>
        </Box>
      )}

      {/* Questions */}
      {!isCompleted && (
        <Stack spacing={2}>
          {questions.map((question, index) => (
            <Box key={question.id} sx={cardStyle}>
              <Stack spacing={2}>
                {/* Question header */}
                <Stack direction="row" justifyContent="space-between">
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Typography sx={{ fontSize: 13, fontWeight: 500, minWidth: 24 }}>
                      {index + 1}.
                    </Typography>
                    <Stack spacing={0.5}>
                      <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                        {question.question_text}
                        {question.is_required && (
                          <Typography
                            component="span"
                            sx={{ color: theme.palette.status.error.text, ml: 0.5 }}
                          >
                            *
                          </Typography>
                        )}
                      </Typography>
                      {question.eu_ai_act_article && (
                        <Typography sx={{ fontSize: 11, color: theme.palette.other.icon }}>
                          {question.eu_ai_act_article}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>

                  {/* Flag button */}
                  {question.allows_flag_for_concern && (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => question.id && handleToggleFlag(question.id)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        padding: "4px 8px",
                        border: flaggedQuestions.has(question.id!)
                          ? `1px solid ${theme.palette.status.error.text}`
                          : `1px solid ${theme.palette.border.dark}`,
                        borderRadius: "4px",
                        backgroundColor: flaggedQuestions.has(question.id!)
                          ? theme.palette.status.error.bg
                          : "transparent",
                        color: flaggedQuestions.has(question.id!)
                          ? theme.palette.status.error.text
                          : theme.palette.other.icon,
                        fontSize: 12,
                        cursor: "pointer",
                        "&:hover": {
                          borderColor: theme.palette.status.error.text,
                          backgroundColor: theme.palette.status.error.bg,
                        },
                      }}
                    >
                      <Flag size={14} />
                      Flag concern
                    </Box>
                  )}
                </Stack>

                {/* Response input */}
                {question.question_type === "yes_no" && (
                  <Stack spacing={1}>
                    <RadioGroup
                      value={responses[question.id!] ?? ""}
                      onChange={(e) =>
                        handleResponseChange(
                          question.id!,
                          e.target.value === "true"
                        )
                      }
                      row
                    >
                      <FormControlLabel
                        value="true"
                        control={
                          <Radio
                            size="small"
                            sx={{
                              "&.Mui-checked": { color: theme.palette.primary.main },
                            }}
                          />
                        }
                        label={<Typography sx={{ fontSize: 13 }}>Yes</Typography>}
                      />
                      <FormControlLabel
                        value="false"
                        control={
                          <Radio
                            size="small"
                            sx={{
                              "&.Mui-checked": { color: theme.palette.primary.main },
                            }}
                          />
                        }
                        label={<Typography sx={{ fontSize: 13 }}>No</Typography>}
                      />
                    </RadioGroup>

                    {/* Show suggestion when "No" is selected */}
                    {responses[question.id!] === false &&
                      question.suggestion_text && (
                        <Box
                          sx={{
                            backgroundColor: theme.palette.status.warning.bg,
                            border: `1px solid ${theme.palette.status.warning.border}`,
                            borderRadius: "4px",
                            padding: "12px",
                          }}
                        >
                          <Typography sx={{ fontSize: 12, color: theme.palette.status.warning.text }}>
                            {question.suggestion_text}
                          </Typography>
                        </Box>
                      )}
                  </Stack>
                )}

                {question.question_type === "multi_select" && (
                  <Stack spacing={1}>
                    {question.options?.map((option) => (
                      <FormControlLabel
                        key={option}
                        control={
                          <Checkbox
                            size="small"
                            checked={
                              Array.isArray(responses[question.id!])
                                ? (responses[question.id!] as string[]).includes(option)
                                : false
                            }
                            onChange={(e) => {
                              const currentValue = Array.isArray(
                                responses[question.id!]
                              )
                                ? (responses[question.id!] as string[])
                                : [];
                              if (e.target.checked) {
                                handleResponseChange(question.id!, [
                                  ...currentValue,
                                  option,
                                ]);
                              } else {
                                handleResponseChange(
                                  question.id!,
                                  currentValue.filter((v: string) => v !== option)
                                );
                              }
                            }}
                            sx={{
                              "&.Mui-checked": { color: theme.palette.primary.main },
                            }}
                          />
                        }
                        label={<Typography sx={{ fontSize: 13 }}>{option}</Typography>}
                      />
                    ))}
                  </Stack>
                )}

                {question.question_type === "multi_line_text" && (
                  <Field
                    id={`question-${question.id}`}
                    label=""
                    type="description"
                    value={(responses[question.id!] as string) ?? ""}
                    onChange={(e) =>
                      handleResponseChange(question.id!, e.target.value)
                    }
                    sx={{
                      backgroundColor: theme.palette.background.main,
                    }}
                  />
                )}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {/* Action buttons */}
      {!isCompleted && (
        <Stack
          direction="row"
          justifyContent="flex-end"
          spacing={2}
          mt={4}
          mb={4}
        >
          <CustomizableButton
            variant="outlined"
            text={isSaving ? "Saving..." : "Save draft"}
            onClick={handleSaveDraft}
            isDisabled={isSaving || isSubmitting}
            sx={{
              height: "34px",
              border: `1px solid ${theme.palette.border.dark}`,
              color: theme.palette.text.secondary,
              "&:hover": {
                backgroundColor: theme.palette.background.accent,
                border: `1px solid ${theme.palette.border.dark}`,
              },
            }}
          />
          <CustomizableButton
            variant="contained"
            text={isSubmitting ? "Submitting..." : "Submit"}
            onClick={handleSubmit}
            isDisabled={isSaving || isSubmitting}
            sx={{
              height: "34px",
              backgroundColor: theme.palette.primary.main,
              "&:hover": {
                backgroundColor: theme.palette.primary.dark || brand.primaryHover,
              },
            }}
          />
        </Stack>
      )}
    </Stack>
  );
};

export default MonitoringForm;
