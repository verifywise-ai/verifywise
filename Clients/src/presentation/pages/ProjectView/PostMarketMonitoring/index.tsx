/**
 * Post-Market Monitoring Tab Component
 *
 * Main component for PMM configuration within a project/use case.
 * Allows enabling/disabling monitoring, configuring frequency, and managing questions.
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  Box,
  Stack,
  Typography,
  useTheme,
  CircularProgress,
} from "@mui/material";
import { Plus, Trash2, GripVertical, Edit2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Toggle from "../../../components/Inputs/Toggle";
import Chip from "../../../components/Chip";
import { useSearchParams } from "react-router-dom";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import DatePicker from "../../../components/Inputs/Datepicker";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Alert from "../../../components/Alert";
import useUsers from "../../../../application/hooks/useUsers";
import useProjectData from "../../../../application/hooks/useProjectData";
import { useAuth } from "../../../../application/hooks/useAuth";
import allowedRoles from "../../../../application/constants/permissions";
import { pmmService } from "../../../../infrastructure/api/postMarketMonitoringService";
import {
  PMMConfigWithDetails,
  PMMQuestion,
  FrequencyUnit,
} from "../../../../domain/types/PostMarketMonitoring";
import dayjs, { Dayjs } from "dayjs";
import PMMQuestionEditor from "./QuestionEditor";
import { AlertState } from "../../../../application/interfaces/appStates";
import { brand } from "../../../themes/palette";

// Notification hour dropdown items (0-23)
const notificationHourItems = Array.from({ length: 24 }, (_, i) => ({
  _id: i,
  name: `${i.toString().padStart(2, "0")}:00`,
}));

interface LocalAlertState extends AlertState {
  isToast: boolean;
  visible: boolean;
}

// Sortable Question Item Component
interface SortableQuestionItemProps {
  question: PMMQuestion;
  index: number;
  onEdit: (question: PMMQuestion) => void;
  onDelete: (questionId: number) => void;
  disabled?: boolean;
}

const SortableQuestionItem: React.FC<SortableQuestionItemProps> = ({
  question,
  index,
  onEdit,
  onDelete,
  disabled = false,
}) => {
  const theme = useTheme();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id!, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      sx={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        backgroundColor: isDragging
          ? theme.palette.background.main
          : theme.palette.background.accent,
        borderRadius: "4px",
        border: `1px solid ${isDragging ? theme.palette.primary.main : theme.palette.border.light}`,
        gap: 2,
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      <Box
        {...attributes}
        {...(disabled ? {} : listeners)}
        sx={{
          cursor: disabled ? "not-allowed" : "grab",
          display: "flex",
          alignItems: "center",
          opacity: disabled ? 0.5 : 1,
          "&:active": { cursor: disabled ? "not-allowed" : "grabbing" },
        }}
      >
        <GripVertical
          size={16}
          color={theme.palette.other.icon}
          style={{ flexShrink: 0 }}
        />
      </Box>
      <Stack flex={1} spacing={0.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
            {index + 1}. {question.question_text}
          </Typography>
          {question.is_system_default && (
            <Chip label="Default" variant="default" size="small" />
          )}
          {question.is_required && (
            <Chip label="Required" variant="warning" size="small" />
          )}
        </Stack>
        <Typography sx={{ fontSize: 11, color: theme.palette.other.icon }}>
          {question.question_type === "yes_no"
            ? "Yes/No"
            : question.question_type === "multi_select"
            ? "Multiple choice"
            : "Text response"}
          {question.eu_ai_act_article && ` • ${question.eu_ai_act_article}`}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={1}>
        <Box
          component="span"
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Edit question"
          aria-disabled={disabled}
          onClick={() => !disabled && onEdit(question)}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onEdit(question);
            }
          }}
          sx={{
            cursor: disabled ? "not-allowed" : "pointer",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            opacity: disabled ? 0.5 : 1,
            "&:hover": { backgroundColor: disabled ? "transparent" : theme.palette.border.light },
            "&:focus": {
              outline: disabled ? "none" : `2px solid ${theme.palette.primary.main}`,
              outlineOffset: "2px",
            },
          }}
        >
          <Edit2 size={16} color={theme.palette.other.icon} />
        </Box>
        {!question.is_system_default && (
          <Box
            component="span"
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="Delete question"
            aria-disabled={disabled}
            onClick={() => !disabled && question.id && onDelete(question.id)}
            onKeyDown={(e) => {
              if (!disabled && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                if (question.id) onDelete(question.id);
              }
            }}
            sx={{
              cursor: disabled ? "not-allowed" : "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              opacity: disabled ? 0.5 : 1,
              "&:hover": { backgroundColor: disabled ? "transparent" : theme.palette.status.error.light },
              "&:focus": {
                outline: disabled ? "none" : `2px solid ${theme.palette.status.error.text}`,
                outlineOffset: "2px",
              },
            }}
          >
            <Trash2 size={16} color={theme.palette.status.error.text} />
          </Box>
        )}
      </Stack>
    </Box>
  );
};

const PostMarketMonitoring: React.FC = () => {
  const theme = useTheme();
  const [searchParams] = useSearchParams();
  const projectId = parseInt(searchParams.get("projectId") ?? "1", 10);

  const { users } = useUsers();
  const { project } = useProjectData({ projectId: projectId.toString() });
  const { userRoleName } = useAuth();

  // Check if user can edit PMM settings
  const canEdit = allowedRoles.postMarketMonitoring.edit.includes(userRoleName);

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<PMMConfigWithDetails | null>(null);
  const [questions, setQuestions] = useState<PMMQuestion[]>([]);
  const [alert, setAlert] = useState<LocalAlertState | null>(null);

  // Form state
  const [isActive, setIsActive] = useState(false);
  const [frequencyValue, setFrequencyValue] = useState(30);
  const [frequencyUnit, setFrequencyUnit] = useState<FrequencyUnit>("days");
  const [startDate, setStartDate] = useState<string>("");
  const [reminderDays, setReminderDays] = useState(3);
  const [escalationDays, setEscalationDays] = useState(7);
  const [escalationContactId, setEscalationContactId] = useState<number | undefined>();
  const [notificationHour, setNotificationHour] = useState(9);

  // Question editor state
  const [isQuestionEditorOpen, setIsQuestionEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<PMMQuestion | null>(null);

  // Memoize sorted questions to avoid re-sorting on every render
  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.display_order - b.display_order),
    [questions]
  );

  // DnD sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Show alert helper - defined early so other callbacks can use it
  const showAlert = useCallback(
    (variant: LocalAlertState["variant"], body: string, title?: string) => {
      setAlert({ variant, body, title, isToast: true, visible: true });
      setTimeout(() => setAlert(null), 3000);
    },
    []
  );

  // Handle drag end for question reordering
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        // Sort questions by current display_order first
        const sortedQuestions = [...questions].sort((a, b) => a.display_order - b.display_order);
        const oldIndex = sortedQuestions.findIndex((q) => q.id === active.id);
        const newIndex = sortedQuestions.findIndex((q) => q.id === over.id);

        const reorderedQuestions = arrayMove(sortedQuestions, oldIndex, newIndex);

        // Update display_order values to match new positions
        const updatedQuestions = reorderedQuestions.map((q, index) => ({
          ...q,
          display_order: index,
        }));

        // Store original state for potential revert
        const originalQuestions = questions;

        // Update local state immediately for responsiveness
        setQuestions(updatedQuestions);

        // Prepare orders for API
        const orders = updatedQuestions.map((q) => ({
          id: q.id!,
          display_order: q.display_order,
        }));

        try {
          await pmmService.reorderQuestions(orders);
        } catch (error) {
          console.error("Error reordering questions:", error);
          // Revert on error
          setQuestions(originalQuestions);
          showAlert("error", "Failed to reorder questions");
        }
      }
    },
    [questions, showAlert]
  );

  // Load config and questions
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const configData = await pmmService.getConfigByProjectId(projectId);
        setConfig(configData);

        // Populate form state from config
        setIsActive(configData.is_active);
        setFrequencyValue(configData.frequency_value);
        setFrequencyUnit(configData.frequency_unit);
        setStartDate(configData.start_date || "");
        setReminderDays(configData.reminder_days);
        setEscalationDays(configData.escalation_days);
        setEscalationContactId(configData.escalation_contact_id);
        setNotificationHour(configData.notification_hour);

        // Load questions
        if (configData.id) {
          const questionsData = await pmmService.getQuestions(configData.id);
          setQuestions(questionsData);
        }
      } catch (error) {
        // If 404, config doesn't exist yet - that's ok
        const errorStatus = (error as { response?: { status?: number } }).response?.status;
        if (errorStatus !== 404) {
          console.error("Error loading PMM config:", error);
          showAlert("error", "Failed to load monitoring configuration");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Handle toggle monitoring on/off
  const handleToggleActive = useCallback(async () => {
    const newActive = !isActive;
    setIsActive(newActive);

    try {
      if (!config?.id) {
        // Create new config
        const newConfig = await pmmService.createConfig({
          project_id: projectId,
          frequency_value: frequencyValue,
          frequency_unit: frequencyUnit,
          start_date: startDate || undefined,
          reminder_days: reminderDays,
          escalation_days: escalationDays,
          escalation_contact_id: escalationContactId,
          notification_hour: notificationHour,
        });
        setConfig(newConfig);

        // Load default questions
        if (newConfig.id) {
          const questionsData = await pmmService.getQuestions(newConfig.id);
          setQuestions(questionsData);
        }

        showAlert("success", "Post-market monitoring enabled");
      } else {
        // Update existing config
        await pmmService.updateConfig(config.id, { is_active: newActive });
        setConfig({ ...config, is_active: newActive });
        showAlert(
          "success",
          newActive
            ? "Post-market monitoring enabled"
            : "Post-market monitoring disabled"
        );
      }
    } catch (error) {
      console.error("Error toggling PMM:", error);
      setIsActive(!newActive); // Revert
      showAlert("error", "Failed to update monitoring status");
    }
  }, [
    isActive,
    config,
    projectId,
    frequencyValue,
    frequencyUnit,
    startDate,
    reminderDays,
    escalationDays,
    escalationContactId,
    notificationHour,
    showAlert,
  ]);

  // Save configuration
  const handleSaveConfig = useCallback(async () => {
    if (!config?.id) return;

    setIsSaving(true);
    try {
      await pmmService.updateConfig(config.id, {
        frequency_value: frequencyValue,
        frequency_unit: frequencyUnit,
        start_date: startDate || undefined,
        reminder_days: reminderDays,
        escalation_days: escalationDays,
        escalation_contact_id: escalationContactId,
        notification_hour: notificationHour,
      });
      showAlert("success", "Configuration saved successfully");
    } catch (error) {
      console.error("Error saving config:", error);
      showAlert("error", "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  }, [
    config,
    frequencyValue,
    frequencyUnit,
    startDate,
    reminderDays,
    escalationDays,
    escalationContactId,
    notificationHour,
    showAlert,
  ]);

  // Open question editor for new question
  const handleAddQuestion = useCallback(() => {
    setEditingQuestion(null);
    setIsQuestionEditorOpen(true);
  }, []);

  // Open question editor for editing
  const handleEditQuestion = useCallback((question: PMMQuestion) => {
    setEditingQuestion(question);
    setIsQuestionEditorOpen(true);
  }, []);

  // Save question (create or update)
  const handleSaveQuestion = useCallback(
    async (questionData: Partial<PMMQuestion>) => {
      if (!config?.id) return;

      try {
        if (editingQuestion?.id) {
          // Update existing question
          const updated = await pmmService.updateQuestion(editingQuestion.id, questionData);
          setQuestions((prev) =>
            prev.map((q) => (q.id === updated.id ? updated : q))
          );
          showAlert("success", "Question updated");
        } else {
          // Create new question
          const created = await pmmService.addQuestion(config.id, {
            ...questionData,
            question_text: questionData.question_text!,
            question_type: questionData.question_type!,
            display_order: questions.length,
          });
          setQuestions((prev) => [...prev, created]);
          showAlert("success", "Question added");
        }
        setIsQuestionEditorOpen(false);
        setEditingQuestion(null);
      } catch (error) {
        console.error("Error saving question:", error);
        showAlert("error", "Failed to save question");
      }
    },
    [config, editingQuestion, questions.length, showAlert]
  );

  // Delete question
  const handleDeleteQuestion = useCallback(
    async (questionId: number) => {
      try {
        await pmmService.deleteQuestion(questionId);
        setQuestions((prev) => prev.filter((q) => q.id !== questionId));
        showAlert("success", "Question deleted");
      } catch (error) {
        console.error("Error deleting question:", error);
        showAlert("error", "Failed to delete question");
      }
    },
    [showAlert]
  );

  // Styles
  const cardStyle = {
    backgroundColor: theme.palette.background.main,
    border: `1px solid ${theme.palette.border.dark}`,
    borderRadius: "4px",
    padding: "24px",
  };

  const sectionTitleStyle = {
    fontSize: 14,
    fontWeight: 600,
    color: theme.palette.text.primary,
    marginBottom: "16px",
  };

  const fieldStyle = {
    backgroundColor: theme.palette.background.main,
    "& input": {
      padding: "0 14px",
    },
  };

  if (isLoading) {
    return (
      <Stack alignItems="center" justifyContent="center" minHeight={200}>
        <CircularProgress size={32} />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={true}
          onClick={() => setAlert(null)}
        />
      )}

      {/* Enable/Disable Card */}
      <Box sx={cardStyle}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Stack spacing={0.5}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
              Post-market monitoring
            </Typography>
            <Typography sx={{ fontSize: 12, color: theme.palette.other.icon }}>
              {project?.project_title || "Use case"} (EU AI Act Article 9, Article 72)
            </Typography>
          </Stack>
          <Toggle
            checked={isActive}
            onChange={handleToggleActive}
            disabled={!canEdit}
          />
        </Stack>
      </Box>

      {/* Configuration Card - only show when config exists */}
      {config?.id && (
        <Box sx={{ ...cardStyle, opacity: isActive && canEdit ? 1 : 0.6, pointerEvents: isActive && canEdit ? "auto" : "none" }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb="16px">
            <Stack spacing={0.5}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography sx={{ ...sectionTitleStyle, marginBottom: 0 }}>Monitoring schedule</Typography>
                {(!isActive || !canEdit) && (
                  <Chip label={!canEdit ? "View only" : "Disabled"} variant="default" size="small" />
                )}
              </Stack>
              <Typography sx={{ fontSize: 12, color: theme.palette.other.icon }}>
                Emails will be sent to use case stakeholders. Escalation contact is notified if monitoring is overdue.
              </Typography>
            </Stack>
          </Stack>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              rowGap: "20px",
              columnGap: "200px",
              alignItems: "center",
            }}
          >
            {/* Frequency */}
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                Frequency
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.palette.other.icon, mt: 0.5 }}>
                How often to run monitoring
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Field
                id="frequency-value"
                label=""
                type="number"
                value={frequencyValue.toString()}
                onChange={(e) => setFrequencyValue(parseInt(e.target.value, 10) || 1)}
                width={180}
                sx={{ ...fieldStyle, minWidth: "unset" }}
                disabled={!isActive || !canEdit}
              />
              <Typography sx={{ fontSize: 13, color: theme.palette.other.icon, ml: "8px" }}>days</Typography>
            </Stack>

            {/* Start date */}
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                Start date
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.palette.other.icon, mt: 0.5 }}>
                When to begin monitoring
              </Typography>
            </Box>
            <DatePicker
              label=""
              date={startDate ? dayjs(startDate) : null}
              handleDateChange={(date: Dayjs | null) =>
                setStartDate(date?.toISOString() || "")
              }
              sx={{ width: 180 }}
              disabled={!isActive || !canEdit}
            />

            {/* Notification hour */}
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                Notification time
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.palette.other.icon, mt: 0.5 }}>
                Time of day to send notifications
              </Typography>
            </Box>
            <Select
              id="notification-hour"
              label=""
              value={notificationHour}
              onChange={(e) =>
                setNotificationHour(parseInt(e.target.value as string, 10))
              }
              items={notificationHourItems}
              sx={{ width: 180, backgroundColor: theme.palette.background.main }}
              disabled={!isActive || !canEdit}
            />

            {/* Reminder days */}
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                Reminder after
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.palette.other.icon, mt: 0.5 }}>
                Days before sending reminder
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Field
                id="reminder-days"
                label=""
                type="number"
                value={reminderDays.toString()}
                onChange={(e) => setReminderDays(parseInt(e.target.value, 10) || 1)}
                width={180}
                sx={{ ...fieldStyle, minWidth: "unset" }}
                disabled={!isActive || !canEdit}
              />
              <Typography sx={{ fontSize: 13, color: theme.palette.other.icon, ml: "8px" }}>days</Typography>
            </Stack>

            {/* Escalation days */}
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                Escalate after
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.palette.other.icon, mt: 0.5 }}>
                Days before escalating
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Field
                id="escalation-days"
                label=""
                type="number"
                value={escalationDays.toString()}
                onChange={(e) =>
                  setEscalationDays(parseInt(e.target.value, 10) || 1)
                }
                width={180}
                sx={{ ...fieldStyle, minWidth: "unset" }}
                disabled={!isActive || !canEdit}
              />
              <Typography sx={{ fontSize: 13, color: theme.palette.other.icon, ml: "8px" }}>days</Typography>
            </Stack>

            {/* Escalation contact */}
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                Escalation contact
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.palette.other.icon, mt: 0.5 }}>
                Who to notify on escalation
              </Typography>
            </Box>
            <Select
              id="escalation-contact"
              label=""
              value={escalationContactId || ""}
              onChange={(e) =>
                setEscalationContactId(
                  e.target.value ? parseInt(e.target.value as string, 10) : undefined
                )
              }
              items={
                users?.map((user) => ({
                  _id: user.id,
                  name: `${user.name} ${user.surname}`,
                })) || []
              }
              sx={{ width: 180, backgroundColor: theme.palette.background.main }}
              disabled={!isActive || !canEdit}
            />
          </Box>

          {/* Save button */}
          <Stack direction="row" justifyContent="flex-end" mt={4}>
            <CustomizableButton
              variant="contained"
              text="Save configuration"
              onClick={handleSaveConfig}
              isDisabled={isSaving || !config?.id || !isActive || !canEdit}
              sx={{
                height: "34px",
                backgroundColor: theme.palette.primary.main,
                "&:hover": {
                  backgroundColor: theme.palette.primary.dark || brand.primaryHover,
                },
              }}
            />
          </Stack>
        </Box>
      )}

      {/* Questions Card - only show when config exists */}
      {config?.id && (
        <Box sx={{ ...cardStyle, opacity: isActive && canEdit ? 1 : 0.6 }}>
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Stack spacing={0.5}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography sx={sectionTitleStyle}>
                  Monitoring questions
                </Typography>
                {(!isActive || !canEdit) && (
                  <Chip label={!canEdit ? "View only" : "Disabled"} variant="default" size="small" />
                )}
              </Stack>
              <Typography sx={{ fontSize: 12, color: theme.palette.other.icon, mt: -1 }}>
                Questions asked during each monitoring cycle
              </Typography>
            </Stack>
            <CustomizableButton
              variant="outlined"
              text="Add question"
              icon={<Plus size={16} />}
              onClick={handleAddQuestion}
              isDisabled={!isActive || !canEdit}
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
          </Stack>

          {/* Questions list with drag and drop */}
          {questions.length === 0 ? (
            <Typography
              sx={{
                fontSize: 13,
                color: theme.palette.other.icon,
                textAlign: "center",
                py: 4,
              }}
            >
              No questions configured. Add questions to start monitoring.
            </Typography>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortedQuestions.map((q) => q.id!)}
                strategy={verticalListSortingStrategy}
              >
                <Stack spacing="8px">
                  {sortedQuestions.map((question, index) => (
                    <SortableQuestionItem
                      key={question.id}
                      question={question}
                      index={index}
                      onEdit={handleEditQuestion}
                      onDelete={handleDeleteQuestion}
                      disabled={!isActive || !canEdit}
                    />
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
          )}
        </Box>
      )}

      {/* Question Editor Modal */}
      <PMMQuestionEditor
        isOpen={isQuestionEditorOpen}
        onClose={() => {
          setIsQuestionEditorOpen(false);
          setEditingQuestion(null);
        }}
        onSave={handleSaveQuestion}
        question={editingQuestion}
      />
    </Stack>
  );
};

export default PostMarketMonitoring;
