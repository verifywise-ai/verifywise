/**
 * @fileoverview Read-only preview drawer for a built-in template dataset,
 * including expand/collapse and copy-to-my-datasets CTA.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/TemplatePreviewDrawer
 */

import { Fragment, useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  Divider,
  Drawer,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from "@mui/material";
import { Copy, Database, X } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import singleTheme from "../../../themes/v1SingleTheme";
import { palette } from "../../../themes/palette";
import type {
  DatasetPromptRecord,
  SingleTurnPrompt,
} from "../../../../application/repository/deepEval.repository";

export type TemplatePreviewDrawerProps = {
  open: boolean;
  onClose: () => void;
  templateName?: string;
  prompts: DatasetPromptRecord[];
  loading: boolean;
  copying?: boolean;
  onCopy?: () => void;
};

export default function TemplatePreviewDrawer({
  open,
  onClose,
  templateName,
  prompts,
  loading,
  copying = false,
  onCopy,
}: TemplatePreviewDrawerProps) {
  const theme = useTheme();
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setExpandedPromptIds(new Set());
    }
  }, [open]);

  useEffect(() => {
    setExpandedPromptIds(new Set());
  }, [templateName]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Stack
        sx={{
          width: 700,
          maxHeight: "100vh",
          overflowY: "auto",
          p: theme.spacing(10),
          bgcolor: theme.palette.background.paper,
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            mb: 3,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
            }}
          >
            <Database size={18} color={palette.brand.primary} />
            <Typography
              color={theme.palette.text.primary}
              sx={{
                fontWeight: 600,
              }}
            >
              {templateName || "Template"}
            </Typography>
            {prompts.length > 0 && (
              <Chip label={`${prompts.length} prompts`} variant="default" uppercase={false} />
            )}
          </Stack>
          <Box onClick={onClose} sx={{ cursor: "pointer" }}>
            <X size={20} color={theme.palette.text.secondary} />
          </Box>
        </Stack>
        <Divider sx={{ mb: 4, mx: `calc(-1 * ${theme.spacing(10)})` }} />

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress size={32} sx={{ color: palette.brand.primary }} />
          </Box>
        )}

        {/* Empty State */}
        {!loading && prompts.length === 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              py: 12,
              px: 4,
              textAlign: "center",
            }}
          >
            <Database size={48} color={palette.text.disabled} />
            <Typography sx={{ mt: 2, color: palette.text.tertiary, fontWeight: 500 }}>
              No prompts found
            </Typography>
            <Typography sx={{ mt: 0.5, color: palette.text.disabled, fontSize: "13px" }}>
              This template doesn&apos;t contain any prompts
            </Typography>
          </Box>
        )}

        {/* Prompts/Conversations Table */}
        {!loading &&
          prompts.length > 0 &&
          (() => {
            // Check if this is a multi-turn dataset by looking at the first item
            const isMultiTurn = prompts[0] && ("scenario" in prompts[0] || "turns" in prompts[0]);

            if (isMultiTurn) {
              // Multi-turn dataset display - cast to any for flexible access
              const conversations = prompts as unknown as Array<{
                scenario?: string;
                category?: string;
                expected_outcome?: string;
                turns?: Array<{ role: string; content: string }>;
              }>;

              return (
                <TableContainer sx={{ maxWidth: "100%", overflowX: "hidden" }}>
                  <Table
                    sx={{
                      ...singleTheme.tableStyles.primary.frame,
                      tableLayout: "fixed",
                      width: "100%",
                    }}
                  >
                    <TableHead
                      sx={{
                        backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
                      }}
                    >
                      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                        <TableCell
                          sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "8%" }}
                        >
                          #
                        </TableCell>
                        <TableCell
                          sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "18%" }}
                        >
                          Category
                        </TableCell>
                        <TableCell
                          sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "54%" }}
                        >
                          Scenario
                        </TableCell>
                        <TableCell
                          sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "20%" }}
                        >
                          Turns
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {conversations.map((conversation, index) => {
                        const convKey = `conv-${index}`;
                        const isExpanded = expandedPromptIds.has(convKey);
                        const turns = conversation.turns || [];
                        const scenarioText = conversation.scenario || `Conversation ${index + 1}`;
                        const isLongScenario = scenarioText.length > 50;
                        // Try to infer category from scenario or use a default
                        const category =
                          conversation.category ||
                          (scenarioText.toLowerCase().includes("troubleshoot")
                            ? "SUPPORT"
                            : scenarioText.toLowerCase().includes("install")
                              ? "SETUP"
                              : scenarioText.toLowerCase().includes("api")
                                ? "TECHNICAL"
                                : scenarioText.toLowerCase().includes("crash")
                                  ? "DEBUG"
                                  : "GENERAL");

                        return (
                          <Fragment key={convKey}>
                            <TableRow
                              onClick={() => {
                                setExpandedPromptIds((prev) => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(convKey)) {
                                    newSet.delete(convKey);
                                  } else {
                                    newSet.add(convKey);
                                  }
                                  return newSet;
                                });
                              }}
                              sx={{
                                ...singleTheme.tableStyles.primary.body.row,
                                "cursor": "pointer",
                                "&:hover": { backgroundColor: palette.background.accent },
                                "verticalAlign": "top",
                              }}
                            >
                              <TableCell
                                sx={{
                                  ...singleTheme.tableStyles.primary.body.cell,
                                  width: "8%",
                                  verticalAlign: "top",
                                  pt: 1.5,
                                }}
                              >
                                <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                                  {index + 1}
                                </Typography>
                              </TableCell>
                              <TableCell
                                sx={{
                                  ...singleTheme.tableStyles.primary.body.cell,
                                  width: "18%",
                                  overflow: "hidden",
                                  verticalAlign: "top",
                                  pt: 1.5,
                                }}
                              >
                                <Box title={category}>
                                  <Chip
                                    label={
                                      category.length > 10
                                        ? `${category.substring(0, 10)}...`
                                        : category
                                    }
                                    size="small"
                                    backgroundColor={palette.border.dark}
                                    textColor={palette.text.secondary}
                                  />
                                </Box>
                              </TableCell>
                              <TableCell
                                sx={{
                                  ...singleTheme.tableStyles.primary.body.cell,
                                  width: "54%",
                                  overflow: "hidden",
                                  verticalAlign: "top",
                                  pt: 1.5,
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: "13px",
                                    color: theme.palette.text.primary,
                                    overflow: isExpanded ? "visible" : "hidden",
                                    textOverflow: isExpanded ? "clip" : "ellipsis",
                                    whiteSpace: isExpanded ? "pre-wrap" : "nowrap",
                                    maxWidth: "100%",
                                    wordBreak: isExpanded ? "break-word" : "normal",
                                    lineHeight: 1.5,
                                  }}
                                  title={isExpanded ? undefined : scenarioText}
                                >
                                  {isExpanded
                                    ? scenarioText
                                    : isLongScenario
                                      ? `${scenarioText.substring(0, 50)}...`
                                      : scenarioText}
                                </Typography>
                                {(isLongScenario || turns.length > 0) && (
                                  <Typography
                                    sx={{
                                      fontSize: "11px",
                                      color: palette.text.disabled,
                                      mt: 0.5,
                                    }}
                                  >
                                    {isExpanded ? "Collapse" : "Expand"}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell
                                sx={{
                                  ...singleTheme.tableStyles.primary.body.cell,
                                  width: "20%",
                                  verticalAlign: "top",
                                  pt: 1.5,
                                }}
                              >
                                <Chip
                                  label={`${turns.length} TURNS`}
                                  size="small"
                                  backgroundColor={palette.accent.blue.bg}
                                  textColor={palette.accent.blue.text}
                                />
                              </TableCell>
                            </TableRow>

                            {/* Expanded conversation turns */}
                            {isExpanded && (
                              <TableRow>
                                <TableCell colSpan={4} sx={{ p: 0, border: "none" }}>
                                  <Box
                                    sx={{
                                      p: 2,
                                      backgroundColor: palette.background.accent,
                                      borderBottom: `1px solid ${palette.border.dark}`,
                                    }}
                                  >
                                    {conversation.expected_outcome && (
                                      <Box
                                        sx={{
                                          mb: 2,
                                          p: 1.5,
                                          backgroundColor: palette.status.success.bg,
                                          borderRadius: "6px",
                                        }}
                                      >
                                        <Typography
                                          sx={{
                                            fontSize: "11px",
                                            fontWeight: 600,
                                            color: palette.status.success.text,
                                            mb: 0.5,
                                          }}
                                        >
                                          Expected Outcome
                                        </Typography>
                                        <Typography
                                          sx={{
                                            fontSize: "12px",
                                            color: palette.status.success.text,
                                          }}
                                        >
                                          {conversation.expected_outcome}
                                        </Typography>
                                      </Box>
                                    )}
                                    <Stack spacing={1.5}>
                                      {turns.map((turn, turnIdx) => (
                                        <Box
                                          key={turnIdx}
                                          sx={{
                                            display: "flex",
                                            flexDirection:
                                              turn.role === "user" ? "row" : "row-reverse",
                                          }}
                                        >
                                          <Box
                                            sx={{
                                              maxWidth: "85%",
                                              p: 1.5,
                                              borderRadius: "8px",
                                              backgroundColor:
                                                turn.role === "user"
                                                  ? palette.background.hover
                                                  : palette.accent.blue.bg,
                                            }}
                                          >
                                            <Typography
                                              sx={{
                                                fontSize: "10px",
                                                fontWeight: 600,
                                                color:
                                                  turn.role === "user"
                                                    ? palette.text.tertiary
                                                    : palette.accent.blue.text,
                                                mb: 0.5,
                                              }}
                                            >
                                              {turn.role === "user" ? "User" : "Assistant"}
                                            </Typography>
                                            <Typography
                                              sx={{
                                                fontSize: "12px",
                                                color: palette.text.secondary,
                                                whiteSpace: "pre-wrap",
                                              }}
                                            >
                                              {turn.content}
                                            </Typography>
                                          </Box>
                                        </Box>
                                      ))}
                                    </Stack>
                                  </Box>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              );
            }

            // Single-turn dataset display (original table)
            const singleTurnPrompts = prompts as SingleTurnPrompt[];
            return (
              <TableContainer sx={{ maxWidth: "100%", overflowX: "hidden" }}>
                <Table
                  sx={{
                    ...singleTheme.tableStyles.primary.frame,
                    tableLayout: "fixed",
                    width: "100%",
                  }}
                >
                  <TableHead
                    sx={{
                      backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
                    }}
                  >
                    <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                      <TableCell
                        sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "8%" }}
                      >
                        #
                      </TableCell>
                      <TableCell
                        sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "22%" }}
                      >
                        Category
                      </TableCell>
                      <TableCell
                        sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "48%" }}
                      >
                        Prompt
                      </TableCell>
                      <TableCell
                        sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "22%" }}
                      >
                        Difficulty
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {singleTurnPrompts.map((prompt, index) => {
                      const promptKey = prompt.id || `prompt-${index}`;
                      const isExpanded = expandedPromptIds.has(promptKey);
                      const promptText = prompt.prompt || "";
                      const isLongPrompt = promptText.length > 40;

                      return (
                        <TableRow
                          key={promptKey}
                          onClick={() => {
                            if (isLongPrompt) {
                              setExpandedPromptIds((prev) => {
                                const newSet = new Set(prev);
                                if (newSet.has(promptKey)) {
                                  newSet.delete(promptKey);
                                } else {
                                  newSet.add(promptKey);
                                }
                                return newSet;
                              });
                            }
                          }}
                          sx={{
                            ...singleTheme.tableStyles.primary.body.row,
                            "cursor": isLongPrompt ? "pointer" : "default",
                            "&:hover": isLongPrompt
                              ? { backgroundColor: palette.background.accent }
                              : {},
                            "verticalAlign": "top",
                          }}
                        >
                          <TableCell
                            sx={{
                              ...singleTheme.tableStyles.primary.body.cell,
                              width: "8%",
                              verticalAlign: "top",
                              pt: 1.5,
                            }}
                          >
                            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                              {index + 1}
                            </Typography>
                          </TableCell>
                          <TableCell
                            sx={{
                              ...singleTheme.tableStyles.primary.body.cell,
                              width: "22%",
                              overflow: "hidden",
                              verticalAlign: "top",
                              pt: 1.5,
                            }}
                          >
                            <Box title={prompt.category || ""}>
                              <Chip
                                label={
                                  (prompt.category?.length || 0) > 8
                                    ? `${prompt.category.substring(0, 8)}...`
                                    : prompt.category || "-"
                                }
                                size="small"
                                backgroundColor={palette.border.dark}
                                textColor={palette.text.secondary}
                              />
                            </Box>
                          </TableCell>
                          <TableCell
                            sx={{
                              ...singleTheme.tableStyles.primary.body.cell,
                              width: "48%",
                              overflow: "hidden",
                              verticalAlign: "top",
                              pt: 1.5,
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "13px",
                                color: theme.palette.text.primary,
                                overflow: isExpanded ? "visible" : "hidden",
                                textOverflow: isExpanded ? "clip" : "ellipsis",
                                whiteSpace: isExpanded ? "pre-wrap" : "nowrap",
                                maxWidth: "100%",
                                wordBreak: isExpanded ? "break-word" : "normal",
                                lineHeight: 1.5,
                              }}
                              title={isExpanded ? undefined : promptText}
                            >
                              {isExpanded
                                ? promptText
                                : isLongPrompt
                                  ? `${promptText.substring(0, 40)}...`
                                  : promptText}
                            </Typography>
                            {isLongPrompt && (
                              <Typography
                                sx={{ fontSize: "11px", color: palette.text.disabled, mt: 0.5 }}
                              >
                                {isExpanded ? "Collapse" : "Expand"}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell
                            sx={{
                              ...singleTheme.tableStyles.primary.body.cell,
                              width: "22%",
                              verticalAlign: "top",
                              pt: 1.5,
                            }}
                          >
                            {prompt.difficulty && (
                              <Chip
                                label={prompt.difficulty}
                                size="small"
                                uppercase={false}
                                variant={
                                  prompt.difficulty === "easy"
                                    ? "success"
                                    : prompt.difficulty === "medium"
                                      ? "warning"
                                      : prompt.difficulty === "hard"
                                        ? "error"
                                        : "default"
                                }
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            );
          })()}

        {/* Copy Button */}
        {!loading && prompts.length > 0 && templateName && (
          <CustomizableButton
            fullWidth
            variant="contained"
            startIcon={<Copy size={14} />}
            onClick={onCopy}
            isDisabled={copying}
            text={copying ? "Copying..." : "Copy to my datasets"}
            sx={{
              mt: 4,
              minHeight: "40px",
            }}
          />
        )}
      </Stack>
    </Drawer>
  );
}
