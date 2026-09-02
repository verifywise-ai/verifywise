/**
 * @fileoverview Side drawer for editing a single prompt or multi-turn conversation in the dataset inline editor.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/PromptEditDrawer
 */

import { Box, Divider, Drawer, IconButton, Stack, Typography, useTheme } from "@mui/material";
import { Bot, Plus, Trash2, User, X } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Field from "../../../components/Inputs/Field";
import { palette } from "../../../themes/palette";
import {
  isMultiTurnConversation,
  type DatasetPromptRecord,
  type MultiTurnConversation,
  type SingleTurnPrompt,
} from "../../../../application/repository/deepEval.repository";
import type { BuiltInDataset } from "./types";

export type PromptEditDrawerProps = {
  open: boolean;
  onClose: () => void;
  selectedPromptIndex: number | null;
  editablePrompts: DatasetPromptRecord[];
  setEditablePrompts: React.Dispatch<React.SetStateAction<DatasetPromptRecord[]>>;
  editingDataset: BuiltInDataset | null;
  onDeletePrompt: (idx: number) => void;
};

export default function PromptEditDrawer({
  open,
  onClose,
  selectedPromptIndex,
  editablePrompts,
  setEditablePrompts,
  editingDataset,
  onDeletePrompt,
}: PromptEditDrawerProps) {
  const theme = useTheme();

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Stack
        sx={{
          width: 500,
          maxHeight: "100vh",
          overflowY: "auto",
          p: theme.spacing(10),
          bgcolor: theme.palette.background.paper,
        }}
      >
        {/* Drawer Header */}
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            mb: 3,
          }}
        >
          <Typography
            color={theme.palette.text.primary}
            sx={{
              fontWeight: 600,
              fontSize: "16px",
            }}
          >
            Edit prompt
          </Typography>
          <Box onClick={onClose} sx={{ cursor: "pointer" }}>
            <X size={20} color={theme.palette.text.secondary} />
          </Box>
        </Stack>
        <Divider sx={{ mb: 3, mx: `calc(-1 * ${theme.spacing(10)})` }} />

        {selectedPromptIndex !== null && editablePrompts[selectedPromptIndex] && (
          <Stack spacing={3}>
            {/* Multi-turn conversation editor */}
            {isMultiTurnConversation(editablePrompts[selectedPromptIndex]) ? (
              <>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 1 }}>
                    Scenario
                  </Typography>
                  <Field
                    value={
                      (editablePrompts[selectedPromptIndex] as MultiTurnConversation).scenario || ""
                    }
                    onChange={(e) => {
                      const next = [...editablePrompts];
                      next[selectedPromptIndex] = {
                        ...next[selectedPromptIndex],
                        scenario: e.target.value,
                      };
                      setEditablePrompts(next);
                    }}
                    placeholder="Describe the conversation scenario"
                    type="description"
                  />
                </Box>

                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 1 }}>
                    Expected Outcome
                  </Typography>
                  <Field
                    value={
                      (editablePrompts[selectedPromptIndex] as MultiTurnConversation)
                        .expected_outcome || ""
                    }
                    onChange={(e) => {
                      const next = [...editablePrompts];
                      next[selectedPromptIndex] = {
                        ...next[selectedPromptIndex],
                        expected_outcome: e.target.value,
                      };
                      setEditablePrompts(next);
                    }}
                    placeholder="What should the conversation achieve?"
                    type="description"
                  />
                </Box>

                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 2 }}>
                    Conversation Turns
                  </Typography>

                  {/* Chat conversation container */}
                  <Box
                    sx={{
                      border: `1px solid ${palette.accent.purple.border}`,
                      borderRadius: "12px",
                      backgroundColor: palette.accent.purple.bg,
                      p: 2,
                      minHeight: "200px",
                    }}
                  >
                    <Stack spacing={2}>
                      {(
                        (editablePrompts[selectedPromptIndex] as MultiTurnConversation).turns || []
                      ).map((turn, turnIdx) => (
                        <Box
                          key={turnIdx}
                          sx={{
                            display: "flex",
                            flexDirection: turn.role === "user" ? "row-reverse" : "row",
                          }}
                        >
                          <Box
                            sx={{
                              width: "85%",
                              p: 1.5,
                              borderRadius:
                                turn.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                              backgroundColor:
                                turn.role === "user"
                                  ? palette.status.success.bg
                                  : palette.accent.blue.bg,
                              border: "1px solid",
                              borderColor:
                                turn.role === "user"
                                  ? palette.status.success.border
                                  : palette.accent.blue.border,
                            }}
                          >
                            <Stack
                              direction="row"
                              sx={{
                                justifyContent: "space-between",
                                alignItems: "center",
                                mb: 1,
                              }}
                            >
                              <Stack
                                direction="row"
                                spacing={1}
                                sx={{
                                  alignItems: "center",
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: "4px",
                                    backgroundColor:
                                      turn.role === "user"
                                        ? palette.status.success.text
                                        : palette.accent.blue.text,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {turn.role === "user" ? (
                                    <User size={12} color={palette.background.main} />
                                  ) : (
                                    <Bot size={12} color={palette.background.main} />
                                  )}
                                </Box>
                                <Typography
                                  sx={{
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    color:
                                      turn.role === "user"
                                        ? palette.status.success.text
                                        : palette.accent.blue.text,
                                  }}
                                >
                                  {turn.role === "user" ? "User" : "Assistant"}
                                </Typography>
                              </Stack>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  const next = [...editablePrompts];
                                  const conv = next[selectedPromptIndex] as MultiTurnConversation;
                                  const turns = [...(conv.turns || [])];
                                  turns.splice(turnIdx, 1);
                                  next[selectedPromptIndex] = { ...conv, turns };
                                  setEditablePrompts(next);
                                }}
                                sx={{
                                  "p": 0.5,
                                  "color": palette.status.error.text,
                                  "&:hover": { backgroundColor: palette.status.error.bg },
                                }}
                              >
                                <Trash2 size={12} />
                              </IconButton>
                            </Stack>
                            <Field
                              value={turn.content}
                              onChange={(e) => {
                                const next = [...editablePrompts];
                                const conv = next[selectedPromptIndex] as MultiTurnConversation;
                                const turns = [...(conv.turns || [])];
                                turns[turnIdx] = { ...turns[turnIdx], content: e.target.value };
                                next[selectedPromptIndex] = { ...conv, turns };
                                setEditablePrompts(next);
                              }}
                              placeholder={
                                turn.role === "user"
                                  ? "What does the user say?"
                                  : "How should the assistant respond?"
                              }
                              type="description"
                            />
                          </Box>
                        </Box>
                      ))}

                      {/* Empty state when no turns */}
                      {((editablePrompts[selectedPromptIndex] as MultiTurnConversation).turns || [])
                        .length === 0 && (
                        <Box sx={{ py: 4, textAlign: "center" }}>
                          <Typography sx={{ fontSize: "13px", color: palette.text.disabled }}>
                            No conversation turns yet. Add a turn to start building the
                            conversation.
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Box>

                  {/* Add turn button - at the bottom with more spacing */}
                  <CustomizableButton
                    fullWidth
                    variant="outlined"
                    startIcon={<Plus size={14} />}
                    onClick={() => {
                      const next = [...editablePrompts];
                      const conv = next[selectedPromptIndex] as MultiTurnConversation;
                      const turns = [...(conv.turns || [])];
                      const lastRole =
                        turns.length > 0 ? turns[turns.length - 1].role : "assistant";
                      turns.push({
                        role: lastRole === "user" ? "assistant" : "user",
                        content: "",
                      });
                      next[selectedPromptIndex] = { ...conv, turns };
                      setEditablePrompts(next);
                    }}
                    sx={{
                      "mt": 3,
                      "mb": 2,
                      "color": palette.brand.primary,
                      "borderColor": palette.border.dark,
                      "borderStyle": "dashed",
                      "py": 2,
                      "&:hover": {
                        borderColor: palette.brand.primary,
                        backgroundColor: palette.status.success.bg,
                        borderStyle: "dashed",
                      },
                    }}
                  >
                    Add{" "}
                    {((editablePrompts[selectedPromptIndex] as MultiTurnConversation).turns
                      ?.length || 0) > 0
                      ? (
                          editablePrompts[selectedPromptIndex] as MultiTurnConversation
                        ).turns?.slice(-1)[0]?.role === "user"
                        ? "assistant"
                        : "user"
                      : "user"}{" "}
                    turn
                  </CustomizableButton>
                </Box>
              </>
            ) : (
              /* Single-turn prompt editor */
              <>
                <Field
                  label="Prompt"
                  value={(editablePrompts[selectedPromptIndex] as SingleTurnPrompt).prompt || ""}
                  onChange={(e) => {
                    const next = [...editablePrompts];
                    next[selectedPromptIndex] = {
                      ...next[selectedPromptIndex],
                      prompt: e.target.value,
                    };
                    setEditablePrompts(next);
                  }}
                  placeholder="Enter the prompt text"
                  isRequired
                  type="description"
                />

                <Field
                  label="Expected output"
                  value={
                    (editablePrompts[selectedPromptIndex] as SingleTurnPrompt).expected_output || ""
                  }
                  onChange={(e) => {
                    const next = [...editablePrompts];
                    next[selectedPromptIndex] = {
                      ...next[selectedPromptIndex],
                      expected_output: e.target.value,
                    };
                    setEditablePrompts(next);
                  }}
                  placeholder="Enter the expected response"
                  type="description"
                />

                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: "13px", mb: 1 }}>
                    Difficulty
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    {(["easy", "medium", "hard"] as const).map((diff) => {
                      const isSelected =
                        (editablePrompts[selectedPromptIndex] as SingleTurnPrompt).difficulty ===
                        diff;
                      return (
                        <Box
                          key={diff}
                          onClick={() => {
                            const next = [...editablePrompts];
                            next[selectedPromptIndex] = {
                              ...next[selectedPromptIndex],
                              difficulty: diff,
                            };
                            setEditablePrompts(next);
                          }}
                          sx={{ cursor: "pointer" }}
                        >
                          <Chip
                            label={diff.charAt(0).toUpperCase() + diff.slice(1)}
                            variant={
                              isSelected
                                ? diff === "easy"
                                  ? "success"
                                  : diff === "medium"
                                    ? "medium"
                                    : "error"
                                : "default"
                            }
                            uppercase={false}
                          />
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>

                <Field
                  label="Category"
                  value={(editablePrompts[selectedPromptIndex] as SingleTurnPrompt).category || ""}
                  onChange={(e) => {
                    const next = [...editablePrompts];
                    next[selectedPromptIndex] = {
                      ...next[selectedPromptIndex],
                      category: e.target.value,
                    };
                    setEditablePrompts(next);
                  }}
                  placeholder="e.g., general_knowledge, coding, etc."
                />

                <Field
                  label="Keywords"
                  value={(
                    (editablePrompts[selectedPromptIndex] as SingleTurnPrompt).expected_keywords ||
                    []
                  ).join(", ")}
                  onChange={(e) => {
                    const value = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const next = [...editablePrompts];
                    next[selectedPromptIndex] = {
                      ...next[selectedPromptIndex],
                      expected_keywords: value,
                    };
                    setEditablePrompts(next);
                  }}
                  placeholder="Comma separated keywords"
                />

                {/* Only show retrieval context for RAG datasets */}
                {editingDataset?.datasetType === "rag" && (
                  <Field
                    label="Retrieval context"
                    value={(
                      (editablePrompts[selectedPromptIndex] as SingleTurnPrompt)
                        .retrieval_context || []
                    ).join("\n")}
                    onChange={(e) => {
                      const lines = e.target.value.split("\n");
                      const next = [...editablePrompts];
                      next[selectedPromptIndex] = {
                        ...next[selectedPromptIndex],
                        retrieval_context: lines,
                      };
                      setEditablePrompts(next);
                    }}
                    placeholder="One entry per line"
                    type="description"
                  />
                )}
              </>
            )}

            <Stack
              direction="row"
              spacing={2}
              sx={{ mt: 4, pt: 3, borderTop: `1px solid ${palette.border.dark}` }}
            >
              <CustomizableButton
                variant="outlined"
                startIcon={<Trash2 size={14} />}
                onClick={() => {
                  if (selectedPromptIndex !== null) {
                    onDeletePrompt(selectedPromptIndex);
                  }
                }}
                text="Delete"
                sx={{
                  "color": palette.status.error.text,
                  "borderColor": palette.status.error.text,
                  "&:hover": {
                    borderColor: palette.status.error.text,
                    backgroundColor: palette.status.error.bg,
                  },
                  "minHeight": "40px",
                }}
              />
              <CustomizableButton
                variant="contained"
                onClick={onClose}
                text="Done"
                sx={{
                  minHeight: "40px",
                  flex: 1,
                }}
              />
            </Stack>
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}
