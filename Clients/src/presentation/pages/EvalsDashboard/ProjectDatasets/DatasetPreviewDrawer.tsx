/**
 * @fileoverview Read-only preview drawer for a user dataset's prompts.
 *
 * @module pages/EvalsDashboard/ProjectDatasets/DatasetPreviewDrawer
 */

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
import { Database, X } from "lucide-react";
import Chip from "../../../components/Chip";
import singleTheme from "../../../themes/v1SingleTheme";
import { palette } from "../../../themes/palette";
import {
  isMultiTurnConversation,
  type DatasetPromptRecord,
  type MultiTurnConversation,
  type SingleTurnPrompt,
} from "../../../../application/repository/deepEval.repository";

export type DatasetPreviewDrawerProps = {
  open: boolean;
  onClose: () => void;
  datasetName?: string;
  prompts: DatasetPromptRecord[];
  loading: boolean;
};

export default function DatasetPreviewDrawer({
  open,
  onClose,
  datasetName,
  prompts,
  loading,
}: DatasetPreviewDrawerProps) {
  const theme = useTheme();

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
              {datasetName || "Dataset"}
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
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 8 }}>
            <CircularProgress size={32} sx={{ color: palette.brand.primary }} />
          </Box>
        )}

        {/* Empty State */}
        {!loading && prompts.length === 0 && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              No prompts found in this dataset.
            </Typography>
          </Box>
        )}

        {/* Dataset Prompts Table */}
        {!loading && prompts.length > 0 && (
          <TableContainer>
            <Table sx={{ ...singleTheme.tableStyles.primary.frame, tableLayout: "fixed" }}>
              <TableHead
                sx={{
                  backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors,
                }}
              >
                <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                  <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "80px" }}>
                    ID
                  </TableCell>
                  <TableCell
                    sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "100px" }}
                  >
                    {isMultiTurnConversation(prompts[0]) ? "Turns" : "Category"}
                  </TableCell>
                  <TableCell
                    sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "360px" }}
                  >
                    {isMultiTurnConversation(prompts[0]) ? "Scenario" : "Prompt"}
                  </TableCell>
                  <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "80px" }}>
                    {isMultiTurnConversation(prompts[0]) ? "Outcome" : "Difficulty"}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {prompts.map((prompt: DatasetPromptRecord, index: number) => {
                  const isMultiTurn = isMultiTurnConversation(prompt);
                  return (
                    <TableRow
                      key={prompt.id || index}
                      sx={singleTheme.tableStyles.primary.body.row}
                    >
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        <Typography
                          sx={{
                            fontSize: "12px",
                            fontFamily: "monospace",
                            color: palette.text.tertiary,
                          }}
                        >
                          {prompt.id || (isMultiTurn ? `conv_${index + 1}` : `prompt_${index + 1}`)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        {isMultiTurn ? (
                          <Chip
                            label={`${(prompt as MultiTurnConversation).turns?.length || 0} turns`}
                            variant="info"
                            uppercase={false}
                          />
                        ) : (
                          <Chip
                            label={(prompt as SingleTurnPrompt).category || "-"}
                            variant="default"
                            uppercase={false}
                          />
                        )}
                      </TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        <Typography
                          sx={{
                            fontSize: "13px",
                            color: theme.palette.text.primary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {isMultiTurn
                            ? (prompt as MultiTurnConversation).scenario ||
                              (prompt as MultiTurnConversation).turns?.[0]?.content ||
                              "-"
                            : (prompt as SingleTurnPrompt).prompt || "-"}
                        </Typography>
                      </TableCell>
                      <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                        {isMultiTurn ? (
                          <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                            {(prompt as MultiTurnConversation).expected_outcome?.substring(0, 20) ||
                              "-"}
                          </Typography>
                        ) : (
                          (prompt as SingleTurnPrompt).difficulty && (
                            <Chip
                              label={(prompt as SingleTurnPrompt).difficulty!}
                              variant={
                                (prompt as SingleTurnPrompt).difficulty === "easy"
                                  ? "success"
                                  : (prompt as SingleTurnPrompt).difficulty === "medium"
                                    ? "medium"
                                    : (prompt as SingleTurnPrompt).difficulty === "hard"
                                      ? "error"
                                      : "default"
                              }
                              uppercase={false}
                            />
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </Drawer>
  );
}
