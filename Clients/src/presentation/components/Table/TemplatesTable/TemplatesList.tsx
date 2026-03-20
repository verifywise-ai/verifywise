import {
  Box,
  Typography,
  Chip,
  Stack,
  Divider,
} from "@mui/material";
import { Check, FileText } from "lucide-react";
import { brand, text, background, status } from "../../../themes/palette";

// Re-export TemplateRow from this file to avoid circular dependency
export interface TemplateRow {
  key: string;
  name: string;
  path: string;
  type?: "single-turn" | "multi-turn" | "simulated";
  category: "chatbot" | "rag" | "agent";
  test_count?: number;
  difficulty?: { easy: number; medium: number; hard: number };
  description?: string;
}

// Helper function to calculate predominant difficulty
const getPredominantDifficultyLabel = (diff?: { easy: number; medium: number; hard: number }): string => {
  if (!diff) return "Medium";
  const total = diff.easy + diff.medium + diff.hard;
  if (total === 0) return "Medium";
  if (diff.hard >= diff.medium && diff.hard >= diff.easy) return "Hard";
  if (diff.medium >= diff.easy) return "Medium";
  return "Easy";
};

const getDifficultyStyles = (difficulty: string) => {
  switch (difficulty) {
    case "Easy":
      return { backgroundColor: "#c8e6c9", color: "#388e3c" };
    case "Medium":
      return { backgroundColor: "#fff3e0", color: "#ef6c00" };
    case "Hard":
      return { backgroundColor: "#ffebee", color: "#c62828" };
    default:
      return { backgroundColor: "#e0e0e0", color: "#616161" };
  }
};

const getCategoryStyles = (category: string) => {
  switch (category) {
    case "chatbot":
      return { backgroundColor: "#CCFBF1", color: "#0D9488" };
    case "rag":
      return { backgroundColor: "#E0E7FF", color: "#3730A3" };
    case "agent":
      return { backgroundColor: "#FEE2E2", color: "#DC2626" };
    default:
      return { backgroundColor: `${background.hover}`, color: `${status.default.text}` };
  }
};

export interface TemplatesListProps {
  templates: TemplateRow[];
  selectedPath?: string;
  onSelect?: (template: TemplateRow) => void;
  loading?: boolean;
  groupByTurnType?: boolean;
  maxHeight?: string | number;
  compact?: boolean;
}

const TemplatesList: React.FC<TemplatesListProps> = ({
  templates,
  selectedPath,
  onSelect,
  loading = false,
  groupByTurnType = true,
  maxHeight = "300px",
  compact = false,
}) => {
  // Group templates by turn type
  const multiTurn = templates.filter((t) => t.type === "multi-turn");
  const singleTurn = templates.filter((t) => t.type === "single-turn" || !t.type);
  const simulated = templates.filter((t) => t.type === "simulated");

  const TemplateItem = ({ template }: { template: TemplateRow }) => {
    const isSelected = selectedPath === template.path;
    const difficultyLabel = getPredominantDifficultyLabel(template.difficulty);

    return (
      <Box
        onClick={() => onSelect?.(template)}
        sx={{
          p: compact ? 1 : 1.5,
          border: "1px solid",
          borderColor: isSelected ? `${brand.primary}` : `${status.default.border}`,
          borderRadius: "8px",
          cursor: "pointer",
          backgroundColor: isSelected ? "#F0FDF4" : `${background.main}`,
          transition: "all 0.15s ease",
          "&:hover": {
            borderColor: `${brand.primary}`,
            backgroundColor: isSelected ? "#F0FDF4" : `${background.accent}`,
          },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: compact ? 28 : 32,
              height: compact ? 28 : 32,
              borderRadius: "6px",
              backgroundColor: isSelected ? `${brand.primary}` : `${background.hover}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileText size={compact ? 14 : 16} color={isSelected ? `${background.main}` : `${status.default.text}`} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: compact ? "12px" : "13px",
                fontWeight: 500,
                color: "#374151",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {template.name}
            </Typography>
            {template.description && !compact && (
              <Typography
                sx={{
                  fontSize: "11px",
                  color: `${text.disabled}`,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {template.description}
              </Typography>
            )}
          </Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
            <Chip
              label={template.category === "rag" ? "RAG" : template.category === "chatbot" ? "Chatbot" : "Agent"}
              size="small"
              sx={{
                height: compact ? "18px" : "20px",
                fontSize: compact ? "9px" : "10px",
                fontWeight: 500,
                borderRadius: "4px",
                ...getCategoryStyles(template.category),
              }}
            />
            {template.test_count && (
              <Typography sx={{ fontSize: compact ? "10px" : "11px", color: `${text.disabled}` }}>
                {template.test_count}
              </Typography>
            )}
            <Chip
              label={difficultyLabel}
              size="small"
              sx={{
                ...getDifficultyStyles(difficultyLabel),
                height: compact ? "18px" : "20px",
                fontSize: compact ? "9px" : "10px",
                fontWeight: 500,
                borderRadius: "4px",
                "& .MuiChip-label": { px: 0.75 },
              }}
            />
            {isSelected && <Check size={14} color={brand.primary} />}
          </Stack>
        </Stack>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ py: 3, textAlign: "center" }}>
        <Typography sx={{ fontSize: "13px", color: `${status.default.text}` }}>Loading templates...</Typography>
      </Box>
    );
  }

  if (templates.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: "center" }}>
        <Typography sx={{ fontSize: "13px", color: `${status.default.text}` }}>No templates available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxHeight, overflowY: "auto" }}>
      {groupByTurnType ? (
        <Stack spacing={2}>
          {/* Multi-turn templates */}
          {multiTurn.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography
                  sx={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: `${status.default.text}`,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Multi-Turn Conversations
                </Typography>
                <Chip
                  label={multiTurn.length}
                  size="small"
                  sx={{
                    height: "16px",
                    fontSize: "10px",
                    backgroundColor: "#E3F2FD",
                    color: "#1565C0",
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              </Stack>
              <Stack spacing={0.75}>
                {multiTurn.map((template) => (
                  <TemplateItem key={template.key} template={template} />
                ))}
              </Stack>
            </Box>
          )}

          {/* Single-turn templates */}
          {singleTurn.length > 0 && (
            <Box>
              {multiTurn.length > 0 && <Divider sx={{ mb: 2 }} />}
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography
                  sx={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: `${status.default.text}`,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Single-Turn Prompts
                </Typography>
                <Chip
                  label={singleTurn.length}
                  size="small"
                  sx={{
                    height: "16px",
                    fontSize: "10px",
                    backgroundColor: "#FEF3C7",
                    color: "#92400E",
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              </Stack>
              <Stack spacing={0.75}>
                {singleTurn.map((template) => (
                  <TemplateItem key={template.key} template={template} />
                ))}
              </Stack>
            </Box>
          )}

          {/* Simulated templates */}
          {simulated.length > 0 && (
            <Box>
              {(multiTurn.length > 0 || singleTurn.length > 0) && (
                <Divider sx={{ mb: 2 }} />
              )}
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography
                  sx={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: `${status.default.text}`,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Simulated Conversations
                </Typography>
                <Chip
                  label={simulated.length}
                  size="small"
                  sx={{
                    height: "16px",
                    fontSize: "10px",
                    backgroundColor: "#EDE9FE",
                    color: "#6D28D9",
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              </Stack>
              <Stack spacing={0.75}>
                {simulated.map((template) => (
                  <TemplateItem key={template.key} template={template} />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      ) : (
        <Stack spacing={0.75}>
          {templates.map((template) => (
            <TemplateItem key={template.key} template={template} />
          ))}
        </Stack>
      )}
    </Box>
  );
};

export default TemplatesList;
export { TemplatesList, getPredominantDifficultyLabel, getDifficultyStyles, getCategoryStyles };

// Re-export getTypeStyles (same logic, re-implemented for co-location)
export const getTypeStyles = (type?: string) => {
  switch (type) {
    case "single-turn":
      return { backgroundColor: "#FEF3C7", color: "#92400E" };
    case "multi-turn":
      return { backgroundColor: "#E3F2FD", color: "#1565C0" };
    case "simulated":
      return { backgroundColor: "#EDE9FE", color: "#6D28D9" };
    default:
      return { backgroundColor: `${background.hover}`, color: `${status.default.text}` };
  }
};

