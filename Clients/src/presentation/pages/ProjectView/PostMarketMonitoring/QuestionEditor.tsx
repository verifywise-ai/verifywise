/**
 * PMM Question Editor Modal
 *
 * Modal for creating and editing monitoring questions.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Stack, Typography, Box, IconButton, useTheme } from "@mui/material";
import { Plus, X } from "lucide-react";
import StandardModal from "../../../components/Modals/StandardModal";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import Checkbox from "../../../components/Inputs/Checkbox";
import { PMMQuestion, QuestionType } from "../../../../domain/types/PostMarketMonitoring";

interface PMMQuestionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (question: Partial<PMMQuestion>) => Promise<void>;
  question: PMMQuestion | null;
}

const questionTypeItems = [
  { _id: "yes_no", name: "Yes/No" },
  { _id: "multi_select", name: "Multiple choice" },
  { _id: "multi_line_text", name: "Text response" },
];

const PMMQuestionEditor: React.FC<PMMQuestionEditorProps> = ({
  isOpen,
  onClose,
  onSave,
  question,
}) => {
  const theme = useTheme();
  const isEditing = !!question?.id;

  // Form state
  const [questionText, setQuestionText] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("yes_no");
  const [options, setOptions] = useState<string[]>([]);
  const [suggestionText, setSuggestionText] = useState("");
  const [isRequired, setIsRequired] = useState(true);
  const [allowsFlagForConcern, setAllowsFlagForConcern] = useState(true);
  const [euAiActArticle, setEuAiActArticle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form when question changes
  useEffect(() => {
    if (question) {
      setQuestionText(question.question_text);
      setQuestionType(question.question_type);
      setOptions(question.options || []);
      setSuggestionText(question.suggestion_text || "");
      setIsRequired(question.is_required);
      setAllowsFlagForConcern(question.allows_flag_for_concern);
      setEuAiActArticle(question.eu_ai_act_article || "");
    } else {
      // Reset form for new question
      setQuestionText("");
      setQuestionType("yes_no");
      setOptions([]);
      setSuggestionText("");
      setIsRequired(true);
      setAllowsFlagForConcern(true);
      setEuAiActArticle("");
    }
    setErrors({});
  }, [question, isOpen]);

  // Validate form
  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!questionText.trim()) {
      newErrors.questionText = "Question text is required";
    }

    if (questionType === "multi_select" && options.filter((o) => o.trim()).length < 2) {
      newErrors.options = "At least 2 options are required for multiple choice";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [questionText, questionType, options]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (!validate()) return;

    setIsSaving(true);
    try {
      await onSave({
        question_text: questionText.trim(),
        question_type: questionType,
        options: questionType === "multi_select" ? options.filter((o) => o.trim()) : [],
        suggestion_text: suggestionText.trim() || undefined,
        is_required: isRequired,
        allows_flag_for_concern: allowsFlagForConcern,
        eu_ai_act_article: euAiActArticle.trim() || undefined,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    validate,
    onSave,
    questionText,
    questionType,
    options,
    suggestionText,
    isRequired,
    allowsFlagForConcern,
    euAiActArticle,
  ]);

  // Handle adding option
  const handleAddOption = useCallback(() => {
    setOptions((prev) => [...prev, ""]);
  }, []);

  // Handle updating option
  const handleUpdateOption = useCallback((index: number, value: string) => {
    setOptions((prev) => {
      const newOptions = [...prev];
      newOptions[index] = value;
      return newOptions;
    });
  }, []);

  // Handle removing option
  const handleRemoveOption = useCallback((index: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const fieldStyle = {
    backgroundColor: theme.palette.background.main,
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit question" : "Add question"}
      description="Configure the monitoring question details"
      onSubmit={handleSave}
      submitButtonText={isEditing ? "Update" : "Add"}
      isSubmitting={isSaving}
      maxWidth="600px"
    >
      <Stack spacing={4}>
        {/* Question text */}
        <Stack spacing={1}>
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Question text *</Typography>
          <Field
            id="question-text"
            label=""
            type="description"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            sx={fieldStyle}
            error={errors.questionText}
            isRequired
          />
        </Stack>

        {/* Question type */}
        <Stack spacing={1}>
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Response type *</Typography>
          <Select
            id="question-type"
            label=""
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value as QuestionType)}
            items={questionTypeItems}
            sx={{ width: "100%", ...fieldStyle }}
          />
        </Stack>

        {/* Options for multi-select */}
        {questionType === "multi_select" && (
          <Stack spacing={1}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Options *</Typography>
            <Typography sx={{ fontSize: 12, color: theme.palette.other.icon }}>
              Add at least 2 options for the user to choose from
            </Typography>
            <Stack spacing={1} mt={1}>
              {options.map((option, index) => (
                <Stack key={index} direction="row" spacing={1} alignItems="center">
                  <Field
                    id={`option-${index}`}
                    label=""
                    value={option}
                    onChange={(e) => handleUpdateOption(index, e.target.value)}
                    sx={{ flex: 1, ...fieldStyle }}
                  />
                  <IconButton
                    onClick={() => handleRemoveOption(index)}
                    size="small"
                    sx={{
                      color: theme.palette.other.icon,
                      "&:hover": {
                        backgroundColor: theme.palette.status.error.light,
                        color: theme.palette.status.error.text,
                      },
                    }}
                  >
                    <X size={16} />
                  </IconButton>
                </Stack>
              ))}
              <Box
                component="button"
                type="button"
                onClick={handleAddOption}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  padding: "8px 12px",
                  border: `1px dashed ${theme.palette.border.dark}`,
                  borderRadius: "4px",
                  backgroundColor: "transparent",
                  color: theme.palette.other.icon,
                  fontSize: 13,
                  cursor: "pointer",
                  "&:hover": {
                    borderColor: theme.palette.other.icon,
                    backgroundColor: theme.palette.background.accent,
                  },
                }}
              >
                <Plus size={16} />
                Add option
              </Box>
            </Stack>
            {errors.options && (
              <Typography sx={{ fontSize: 12, color: theme.palette.status.error.text }}>
                {errors.options}
              </Typography>
            )}
          </Stack>
        )}

        {/* Suggestion text (for yes/no questions) */}
        {questionType === "yes_no" && (
          <Stack spacing={1}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
              Suggestion when "No" is selected
            </Typography>
            <Typography sx={{ fontSize: 12, color: theme.palette.other.icon }}>
              Optional guidance text shown when user answers "No"
            </Typography>
            <Field
              id="suggestion-text"
              label=""
              type="description"
              value={suggestionText}
              onChange={(e) => setSuggestionText(e.target.value)}
              sx={fieldStyle}
            />
          </Stack>
        )}

        {/* EU AI Act article reference */}
        <Stack spacing={1}>
          <Typography sx={{ fontSize: 13, fontWeight: 500 }}>EU AI Act reference</Typography>
          <Typography sx={{ fontSize: 12, color: theme.palette.other.icon }}>
            Optional article reference (e.g., "Article 9", "Article 72")
          </Typography>
          <Field
            id="eu-ai-act-article"
            label=""
            value={euAiActArticle}
            onChange={(e) => setEuAiActArticle(e.target.value)}
            width={200}
            sx={fieldStyle}
          />
        </Stack>

        {/* Required toggle */}
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack spacing={0.5}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Required question</Typography>
            <Typography sx={{ fontSize: 12, color: theme.palette.other.icon }}>
              User must answer this question to submit
            </Typography>
          </Stack>
          <Checkbox
            id="is-required"
            isChecked={isRequired}
            value="required"
            onChange={(e) => setIsRequired(e.target.checked)}
            size="small"
          />
        </Stack>

        {/* Allow flag for concern toggle */}
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack spacing={0.5}>
            <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Allow flag for concern</Typography>
            <Typography sx={{ fontSize: 12, color: theme.palette.other.icon }}>
              User can flag this question for immediate attention
            </Typography>
          </Stack>
          <Checkbox
            id="allows-flag"
            isChecked={allowsFlagForConcern}
            value="allows-flag"
            onChange={(e) => setAllowsFlagForConcern(e.target.checked)}
            size="small"
          />
        </Stack>
      </Stack>
    </StandardModal>
  );
};

export default PMMQuestionEditor;
