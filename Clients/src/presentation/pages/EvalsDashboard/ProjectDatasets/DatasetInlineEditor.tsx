/**
 * @fileoverview Inline dataset editor view: name field, prompts table, and prompt edit drawer.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/DatasetInlineEditor
 */

import {
  Box,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ArrowLeft, Check, Copy, Download, Plus, Save as SaveIcon, Trash2 } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Alert from "../../../components/Alert";
import Chip from "../../../components/Chip";
import Field from "../../../components/Inputs/Field";
import singleTheme from "../../../themes/v1SingleTheme";
import { palette } from "../../../themes/palette";
import {
  isMultiTurnConversation,
  type DatasetPromptRecord,
  type MultiTurnConversation,
  type SingleTurnPrompt,
} from "../../../../application/repository/deepEval.repository";
import PromptEditDrawer from "./PromptEditDrawer";
import type { BuiltInDataset } from "./types";

export type DatasetInlineEditorProps = {
  alert: { variant: "success" | "error"; body: string } | null;
  setAlert: React.Dispatch<
    React.SetStateAction<{ variant: "success" | "error"; body: string } | null>
  >;
  editingDataset: BuiltInDataset;
  editDatasetName: string;
  setEditDatasetName: React.Dispatch<React.SetStateAction<string>>;
  editablePrompts: DatasetPromptRecord[];
  setEditablePrompts: React.Dispatch<React.SetStateAction<DatasetPromptRecord[]>>;
  copiedJson: boolean;
  setCopiedJson: React.Dispatch<React.SetStateAction<boolean>>;
  isValidToSave: boolean;
  savingDataset: boolean;
  onCloseEditor: () => void;
  onSaveDataset: () => void;
  onAddPrompt: () => void;
  onDeletePrompt: (idx: number) => void;
  promptDrawerOpen: boolean;
  setPromptDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedPromptIndex: number | null;
  setSelectedPromptIndex: React.Dispatch<React.SetStateAction<number | null>>;
};

export default function DatasetInlineEditor({
  alert,
  setAlert,
  editingDataset,
  editDatasetName,
  setEditDatasetName,
  editablePrompts,
  setEditablePrompts,
  copiedJson,
  setCopiedJson,
  isValidToSave,
  savingDataset,
  onCloseEditor,
  onSaveDataset,
  onAddPrompt,
  onDeletePrompt,
  promptDrawerOpen,
  setPromptDrawerOpen,
  selectedPromptIndex,
  setSelectedPromptIndex,
}: DatasetInlineEditorProps) {
  const handleClosePromptDrawer = () => {
    setPromptDrawerOpen(false);
    setSelectedPromptIndex(null);
  };

  return (
    <Box>
      {alert && <Alert variant={alert.variant} body={alert.body} />}

      {/* Header with back button and save */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <IconButton size="small" onClick={onCloseEditor} aria-label="Back">
            <ArrowLeft size={18} />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "16px" }}>
            Edit dataset
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <CustomizableButton
            variant="outlined"
            onClick={async () => {
              try {
                const json = JSON.stringify(editablePrompts, null, 2);
                await navigator.clipboard.writeText(json);
                setCopiedJson(true);
                setTimeout(() => setCopiedJson(false), 2000);
              } catch {
                setAlert({ variant: "error", body: "Failed to copy to clipboard" });
                setTimeout(() => setAlert(null), 3000);
              }
            }}
            startIcon={copiedJson ? <Check size={16} /> : <Copy size={16} />}
            text={copiedJson ? "Copied!" : "Copy JSON"}
            sx={{
              "color": copiedJson ? palette.status.success.text : palette.text.secondary,
              "borderColor": copiedJson ? palette.status.success.text : palette.border.dark,
              "&:hover": {
                borderColor: palette.text.disabled,
                backgroundColor: palette.background.accent,
              },
            }}
          />
          <CustomizableButton
            variant="outlined"
            onClick={() => {
              const json = JSON.stringify(editablePrompts, null, 2);
              const blob = new Blob([json], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const slug =
                editDatasetName
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "_")
                  .replace(/^_+|_+$/g, "") || "dataset";
              a.download = `${slug}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            startIcon={<Download size={16} />}
            text="Download"
            sx={{
              "color": palette.text.secondary,
              "borderColor": palette.border.dark,
              "&:hover": {
                borderColor: palette.text.disabled,
                backgroundColor: palette.background.accent,
              },
            }}
          />
          <CustomizableButton
            variant="contained"
            isDisabled={!isValidToSave || savingDataset}
            startIcon={<SaveIcon size={16} />}
            onClick={onSaveDataset}
            text={savingDataset ? "Saving..." : "Save"}
          />
        </Stack>
      </Stack>

      {/* Dataset name input */}
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Field
          label="Dataset name"
          value={editDatasetName}
          onChange={(e) => setEditDatasetName(e.target.value)}
          placeholder="Enter a descriptive name for this dataset"
          isRequired
        />
        <Typography variant="body2" sx={{ color: palette.text.tertiary, fontSize: "13px" }}>
          Edit the prompts below, then click Save to update your dataset.
        </Typography>
      </Stack>

      {/* Prompts/Conversations table */}
      <TableContainer>
        <Table sx={{ ...singleTheme.tableStyles.primary.frame, tableLayout: "fixed" }}>
          <TableHead
            sx={{ backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors }}
          >
            <TableRow sx={singleTheme.tableStyles.primary.header.row}>
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  width: "70px",
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                ID
              </TableCell>
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  width: "35%",
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                {editablePrompts.length > 0 && isMultiTurnConversation(editablePrompts[0])
                  ? "SCENARIO / TURNS"
                  : "PROMPT"}
              </TableCell>
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  width: "12%",
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                {editablePrompts.length > 0 && isMultiTurnConversation(editablePrompts[0])
                  ? "TURNS"
                  : "DIFFICULTY"}
              </TableCell>
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  width: "33%",
                  textAlign: "center",
                  fontWeight: 600,
                }}
              >
                {editablePrompts.length > 0 && isMultiTurnConversation(editablePrompts[0])
                  ? "OUTCOME"
                  : "CATEGORY"}
              </TableCell>
              <TableCell
                sx={{
                  ...singleTheme.tableStyles.primary.header.cell,
                  width: "50px",
                  textAlign: "center",
                }}
              ></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {editablePrompts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ textAlign: "center", py: 4 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    No prompts in this dataset yet.
                  </Typography>
                  <CustomizableButton
                    variant="outlined"
                    startIcon={<Plus size={16} />}
                    onClick={onAddPrompt}
                    text="Add your first prompt"
                    sx={{
                      "color": palette.brand.primary,
                      "borderColor": palette.brand.primary,
                      "&:hover": {
                        borderColor: palette.brand.primaryHover,
                        backgroundColor: palette.brand.primaryLight,
                      },
                    }}
                  />
                </TableCell>
              </TableRow>
            ) : (
              editablePrompts.map((p, idx) => {
                const isMultiTurn = isMultiTurnConversation(p);
                const displayText = isMultiTurn
                  ? (p as MultiTurnConversation).scenario ||
                    (p as MultiTurnConversation).turns?.[0]?.content ||
                    "Empty conversation"
                  : (p as SingleTurnPrompt).prompt || "Empty prompt - click to edit";
                const hasContent = isMultiTurn
                  ? (p as MultiTurnConversation).turns?.length > 0
                  : !!(p as SingleTurnPrompt).prompt;

                return (
                  <TableRow
                    key={p.id || idx}
                    onClick={() => {
                      setSelectedPromptIndex(idx);
                      setPromptDrawerOpen(true);
                    }}
                    sx={{
                      ...singleTheme.tableStyles.primary.body.row,
                      "cursor": "pointer",
                      "&:hover": { backgroundColor: palette.background.hover },
                    }}
                  >
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        width: "70px",
                        textAlign: "center",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "12px",
                          fontFamily: "monospace",
                          color: palette.text.tertiary,
                        }}
                      >
                        {p.id || (isMultiTurn ? `conv_${idx + 1}` : `prompt_${idx + 1}`)}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        width: "35%",
                        textAlign: "center",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "13px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          color: hasContent ? palette.text.secondary : palette.text.disabled,
                          fontStyle: hasContent ? "normal" : "italic",
                        }}
                      >
                        {displayText}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        width: "12%",
                        textAlign: "center",
                      }}
                    >
                      {isMultiTurn ? (
                        <Chip
                          label={`${(p as MultiTurnConversation).turns?.length || 0} turns`}
                          variant="info"
                          uppercase={false}
                        />
                      ) : (p as SingleTurnPrompt).difficulty ? (
                        <Chip
                          label={(p as SingleTurnPrompt).difficulty!}
                          variant={
                            (p as SingleTurnPrompt).difficulty === "easy"
                              ? "success"
                              : (p as SingleTurnPrompt).difficulty === "medium"
                                ? "medium"
                                : (p as SingleTurnPrompt).difficulty === "hard"
                                  ? "error"
                                  : "default"
                          }
                          uppercase={false}
                        />
                      ) : null}
                    </TableCell>
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        width: "33%",
                        textAlign: "center",
                      }}
                    >
                      {isMultiTurn ? (
                        <Typography
                          sx={{
                            fontSize: "12px",
                            color: palette.text.tertiary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {(p as MultiTurnConversation).expected_outcome || "-"}
                        </Typography>
                      ) : (
                        <Chip
                          label={(p as SingleTurnPrompt).category || "uncategorized"}
                          variant="default"
                          uppercase={false}
                        />
                      )}
                    </TableCell>
                    <TableCell
                      sx={{
                        ...singleTheme.tableStyles.primary.body.cell,
                        width: "50px",
                        textAlign: "center",
                      }}
                    >
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePrompt(idx);
                        }}
                        sx={{
                          "color": palette.status.error.text,
                          "&:hover": { backgroundColor: palette.status.error.bg },
                        }}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add prompt button */}
      {editablePrompts.length > 0 && (
        <CustomizableButton
          variant="outlined"
          startIcon={<Plus size={16} />}
          onClick={onAddPrompt}
          fullWidth
          text="Add prompt"
          sx={{
            "mt": 2,
            "color": palette.brand.primary,
            "borderColor": palette.border.dark,
            "borderStyle": "dashed",
            "py": 1.5,
            "&:hover": {
              borderColor: palette.brand.primary,
              backgroundColor: palette.brand.primaryLight,
              borderStyle: "dashed",
            },
          }}
        />
      )}

      <PromptEditDrawer
        open={promptDrawerOpen}
        onClose={handleClosePromptDrawer}
        selectedPromptIndex={selectedPromptIndex}
        editablePrompts={editablePrompts}
        setEditablePrompts={setEditablePrompts}
        editingDataset={editingDataset}
        onDeletePrompt={onDeletePrompt}
      />
    </Box>
  );
}
