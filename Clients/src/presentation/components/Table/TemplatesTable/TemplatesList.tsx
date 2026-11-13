import { Box, Typography, Chip, Stack, Divider } from "@mui/material";
import { Check, FileText } from "lucide-react";
import { brand, text, background, status, accent, radiusPx } from "../../../themes/palette";

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
const getPredominantDifficultyLabel = (diff?: {
  easy: number;
  medium: number;
  hard: number;
}): string => {
  if (!diff) return "Medium";
  const total = diff.easy + diff.medium + diff.hard;
  if (total === 0) return "Medium";
  if (diff.hard >= diff.medium && diff.hard >= diff.easy) return "Hard";
  if (diff.medium >= diff.easy) return "Medium";
  return "Easy";
};

// One difficulty-to-chip mapping for every dataset screen.
export const getDifficultyVariant = (
  difficulty?: string,
): "success" | "warning" | "error" | "default" => {
  switch (difficulty?.toLowerCase()) {
    case "easy":
      return "success";
    case "medium":
      return "warning";
    case "hard":
    case "very hard":
      return "error";
    default:
      return "default";
  }
};

const getDifficultyStyles = (difficulty: string) => {
  const tone = status[getDifficultyVariant(difficulty)];
  return { backgroundColor: `${tone.bg}`, color: `${tone.text}` };
};

const getCategoryStyles = (category: string) => {
  switch (category) {
    case "chatbot":
      return { backgroundColor: `${accent.teal.bg}`, color: `${accent.teal.text}` };
    case "rag":
      return { backgroundColor: `${accent.indigo.bg}`, color: `${accent.indigo.text}` };
    case "agent":
      return { backgroundColor: `${accent.red.bg}`, color: `${accent.red.text}` };
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
          "p": compact ? "2px" : "3px",
          "border": "1px solid",
          "borderColor": isSelected ? `${brand.primary}` : `${status.default.border}`,
          "borderRadius": radiusPx.sm,
          "cursor": "pointer",
          "backgroundColor": isSelected ? `${brand.primaryLight}` : `${background.main}`,
          "transition": "all 0.15s ease",
          "&:hover": {
            borderColor: `${brand.primary}`,
            backgroundColor: isSelected ? `${brand.primaryLight}` : `${background.accent}`,
          },
        }}
      >
        <Stack direction="row" alignItems="center" spacing="3px">
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
            <FileText
              size={compact ? 14 : 16}
              color={isSelected ? `${background.main}` : `${status.default.text}`}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: compact ? "12px" : "13px",
                fontWeight: 500,
                color: text.secondary,
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
          <Stack direction="row" alignItems="center" spacing="1px" sx={{ flexShrink: 0 }}>
            <Chip
              label={
                template.category === "rag"
                  ? "RAG"
                  : template.category === "chatbot"
                    ? "Chatbot"
                    : "Agent"
              }
              size="small"
              sx={{
                height: compact ? "18px" : "20px",
                fontSize: compact ? "9px" : "10px",
                fontWeight: 500,
                borderRadius: radiusPx.sm,
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
                "height": compact ? "18px" : "20px",
                "fontSize": compact ? "9px" : "10px",
                "fontWeight": 500,
                "borderRadius": radiusPx.sm,
                "& .MuiChip-label": { px: "1.5px" },
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
      <Box sx={{ py: "6px", textAlign: "center" }}>
        <Typography sx={{ fontSize: "13px", color: `${status.default.text}` }}>
          Loading templates...
        </Typography>
      </Box>
    );
  }

  if (templates.length === 0) {
    return (
      <Box sx={{ py: "6px", textAlign: "center" }}>
        <Typography sx={{ fontSize: "13px", color: `${status.default.text}` }}>
          No templates available
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ maxHeight, overflowY: "auto" }}>
      {groupByTurnType ? (
        <Stack spacing="4px">
          {/* Multi-turn templates */}
          {multiTurn.length > 0 && (
            <Box>
              <Stack direction="row" alignItems="center" spacing="2px" sx={{ mb: "2px" }}>
                <Typography
                  sx={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: `${status.default.text}`,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Multi-turn conversations
                </Typography>
                <Chip
                  label={multiTurn.length}
                  size="small"
                  sx={{
                    "height": "16px",
                    "fontSize": "10px",
                    ...TYPE_CHIP_STYLES,
                    "& .MuiChip-label": { px: "1.5px" },
                  }}
                />
              </Stack>
              <Stack spacing="1.5px">
                {multiTurn.map((template) => (
                  <TemplateItem key={template.key} template={template} />
                ))}
              </Stack>
            </Box>
          )}

          {/* Single-turn templates */}
          {singleTurn.length > 0 && (
            <Box>
              {multiTurn.length > 0 && <Divider sx={{ mb: "4px" }} />}
              <Stack direction="row" alignItems="center" spacing="2px" sx={{ mb: "2px" }}>
                <Typography
                  sx={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: `${status.default.text}`,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Single-turn prompts
                </Typography>
                <Chip
                  label={singleTurn.length}
                  size="small"
                  sx={{
                    "height": "16px",
                    "fontSize": "10px",
                    ...TYPE_CHIP_STYLES,
                    "& .MuiChip-label": { px: "1.5px" },
                  }}
                />
              </Stack>
              <Stack spacing="1.5px">
                {singleTurn.map((template) => (
                  <TemplateItem key={template.key} template={template} />
                ))}
              </Stack>
            </Box>
          )}

          {/* Simulated templates */}
          {simulated.length > 0 && (
            <Box>
              {(multiTurn.length > 0 || singleTurn.length > 0) && <Divider sx={{ mb: "4px" }} />}
              <Stack direction="row" alignItems="center" spacing="2px" sx={{ mb: "2px" }}>
                <Typography
                  sx={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: `${status.default.text}`,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Simulated conversations
                </Typography>
                <Chip
                  label={simulated.length}
                  size="small"
                  sx={{
                    "height": "16px",
                    "fontSize": "10px",
                    ...TYPE_CHIP_STYLES,
                    "& .MuiChip-label": { px: "1.5px" },
                  }}
                />
              </Stack>
              <Stack spacing="1.5px">
                {simulated.map((template) => (
                  <TemplateItem key={template.key} template={template} />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      ) : (
        <Stack spacing="1.5px">
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

// Type is a classification, not a status: every turn type uses the same
// neutral chip so it never reads as a warning next to the difficulty chip.
export const TYPE_CHIP_STYLES = {
  backgroundColor: `${background.hover}`,
  color: `${text.secondary}`,
};
