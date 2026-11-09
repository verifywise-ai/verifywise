import { useState } from "react";
import {
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Popover,
  Stack,
  Typography,
  Box,
} from "@mui/material";
import { Trash2, MoreVertical } from "lucide-react";
import singleTheme from "../../../themes/v1SingleTheme";
import { ModelRow } from "./index";
import { CustomizableButton } from "../../button/customizable-button";
import { text, background, border as borderPalette, status, accent } from "../../../themes/palette";
import useFormattedDate from "../../../../application/hooks/useFormattedDate";

interface ModelsTableBodyProps {
  rows: ModelRow[];
  page: number;
  rowsPerPage: number;
  onRowClick?: (model: ModelRow) => void;
  onDelete?: (model: ModelRow) => void;
}

const formatTimestamp = (
  dateStr: string | null | undefined,
  formatDate: ReturnType<typeof useFormattedDate>,
): string => {
  if (!dateStr) return "-";
  return formatDate(dateStr, { includeTime: true });
};

// Provider color mapping for chips. Providers are categories, so they use the
// accent group (not status tokens, which imply a state).
const DEFAULT_PROVIDER_COLORS = { bg: background.surface, text: status.default.text };
const PROVIDER_COLORS: Record<string, { bg: string; text: string }> = {
  openai: { bg: accent.teal.bg, text: accent.teal.text },
  anthropic: { bg: accent.orange.bg, text: accent.orange.text },
  google: { bg: accent.blue.bg, text: accent.blue.text },
  mistral: { bg: accent.purple.bg, text: accent.purple.text },
  ollama: DEFAULT_PROVIDER_COLORS,
  huggingface: { bg: accent.amber.bg, text: accent.amber.text },
  xai: DEFAULT_PROVIDER_COLORS,
  bedrock: { bg: accent.orange.bg, text: accent.orange.text },
  meta: { bg: accent.blue.bg, text: accent.blue.text },
  deepseek: { bg: accent.purple.bg, text: accent.purple.text },
  microsoft: { bg: accent.indigo.bg, text: accent.indigo.text },
  cohere: { bg: accent.amber.bg, text: accent.amber.text },
  perplexity: { bg: accent.teal.bg, text: accent.teal.text },
  nvidia: { bg: accent.teal.bg, text: accent.teal.text },
  qwen: { bg: accent.orange.bg, text: accent.orange.text },
  moonshot: { bg: accent.purple.bg, text: accent.purple.text },
};

const getProviderColor = (provider: string): { bg: string; text: string } => {
  return PROVIDER_COLORS[provider.toLowerCase()] ?? DEFAULT_PROVIDER_COLORS;
};

import * as ProviderIcons from "../../ProviderIcons";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProviderIconComponent = React.FC<any>;

// Map from OpenRouter sub-provider prefix → { display name, icon component }
const OPENROUTER_PROVIDER_MAP: Record<
  string,
  { name: string; Icon: ProviderIconComponent | null }
> = {
  "anthropic": { name: "Anthropic", Icon: ProviderIcons.Anthropic },
  "openai": { name: "OpenAI", Icon: ProviderIcons.OpenAI },
  "meta-llama": { name: "Meta", Icon: ProviderIcons.Meta },
  "meta": { name: "Meta", Icon: ProviderIcons.Meta },
  "google": { name: "Google", Icon: ProviderIcons.Google },
  "mistralai": { name: "Mistral", Icon: ProviderIcons.Mistral },
  "mistral": { name: "Mistral", Icon: ProviderIcons.Mistral },
  "deepseek": { name: "DeepSeek", Icon: ProviderIcons.DeepSeek },
  "microsoft": { name: "Microsoft", Icon: ProviderIcons.Microsoft },
  "cohere": { name: "Cohere", Icon: ProviderIcons.Cohere },
  "perplexity": { name: "Perplexity", Icon: ProviderIcons.Perplexity },
  "nvidia": { name: "NVIDIA", Icon: ProviderIcons.Nvidia },
  "together": { name: "Together AI", Icon: ProviderIcons.Together },
  "groq": { name: "Groq", Icon: ProviderIcons.Groq },
  "moonshotai": { name: "Moonshot AI", Icon: ProviderIcons.Moonshot },
  "qwen": { name: "Qwen", Icon: ProviderIcons.Qwen },
  "01-ai": { name: "01.AI", Icon: null },
  "nousresearch": { name: "Nous Research", Icon: null },
  "x-ai": { name: "xAI", Icon: ProviderIcons.XAI },
};

// First-party provider → icon component map
const PROVIDER_ICON_MAP: Record<string, ProviderIconComponent> = {
  openai: ProviderIcons.OpenAI,
  anthropic: ProviderIcons.Anthropic,
  google: ProviderIcons.Google,
  mistral: ProviderIcons.Mistral,
  ollama: ProviderIcons.Ollama,
  huggingface: ProviderIcons.HuggingFace,
  openrouter: ProviderIcons.OpenRouter,
  deepseek: ProviderIcons.DeepSeek,
  nvidia: ProviderIcons.Nvidia,
  cohere: ProviderIcons.Cohere,
  perplexity: ProviderIcons.Perplexity,
  together: ProviderIcons.Together,
  groq: ProviderIcons.Groq,
};

interface EffectiveProvider {
  key: string;
  displayName: string;
  Icon: ProviderIconComponent | null;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  mistral: "Mistral",
  ollama: "Ollama",
  huggingface: "Hugging Face",
  deepseek: "DeepSeek",
  nvidia: "NVIDIA",
  cohere: "Cohere",
  perplexity: "Perplexity",
  together: "Together AI",
  groq: "Groq",
  bedrock: "AWS Bedrock",
  xai: "xAI",
};

// Returns the actual stored provider (never resolves sub-provider)
const getDirectProvider = (provider: string): EffectiveProvider => {
  const key = provider.toLowerCase();
  return {
    key,
    displayName:
      PROVIDER_DISPLAY_NAMES[key] ?? provider.charAt(0).toUpperCase() + provider.slice(1),
    Icon: PROVIDER_ICON_MAP[key] ?? null,
  };
};

// If provider is "openrouter", parse the model name to get the real sub-provider
const getEffectiveProvider = (provider: string, modelName: string): EffectiveProvider => {
  const providerKey = provider.toLowerCase();
  if (providerKey !== "openrouter") {
    return {
      key: providerKey,
      displayName: provider.charAt(0).toUpperCase() + provider.slice(1),
      Icon: PROVIDER_ICON_MAP[providerKey] ?? null,
    };
  }
  // OpenRouter model IDs look like "anthropic/claude-3.5-sonnet" or "meta-llama/llama-3.1-8b:free"
  const prefix = (modelName?.split("/")?.[0] ?? "").toLowerCase();
  const info = OPENROUTER_PROVIDER_MAP[prefix];
  if (info) {
    return { key: prefix, displayName: info.name, Icon: info.Icon };
  }
  return { key: "openrouter", displayName: "OpenRouter", Icon: ProviderIcons.OpenRouter };
};

const ProviderChipIcon: React.FC<{ Icon: ProviderIconComponent | null; size?: number }> = ({
  Icon,
  size = 14,
}) => {
  if (!Icon) return null;
  return <Icon width={size} height={size} style={{ flexShrink: 0 }} />;
};

const ModelsTableBody: React.FC<ModelsTableBodyProps> = ({
  rows,
  page,
  rowsPerPage,
  onRowClick,
  onDelete,
}) => {
  const formatDate = useFormattedDate();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuRow, setMenuRow] = useState<ModelRow | null>(null);

  const openModelMenu = (e: React.MouseEvent<HTMLElement>, row: ModelRow) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget);
    setMenuRow(row);
  };

  const closeModelMenu = () => {
    setMenuAnchorEl(null);
    setMenuRow(null);
  };

  const deleteModelRow = () => {
    if (menuRow && onDelete) {
      onDelete(menuRow);
    }
    closeModelMenu();
  };

  return (
    <TableBody>
      {rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((model) => {
        const effective = getEffectiveProvider(model.modelProvider, model.modelName);
        const direct = getDirectProvider(model.modelProvider);
        const providerColors = getProviderColor(effective.key);
        const directColors = getProviderColor(direct.key);

        return (
          <TableRow
            key={model.id}
            onClick={() => onRowClick?.(model)}
            sx={{
              ...singleTheme.tableStyles.primary.body.row,
              "cursor": onRowClick ? "pointer" : "default",
              "&:hover": {
                backgroundColor: `${background.accent}`,
              },
            }}
          >
            {/* MODEL — sub-provider logo + model name */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textTransform: "none",
                textAlign: "left",
              }}
            >
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 4, textAlign: "left" }}>
                <Box
                  sx={{
                    width: 24,
                    height: 24,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "5px",
                    backgroundColor: providerColors.bg,
                  }}
                >
                  <ProviderChipIcon Icon={effective.Icon} size={16} />
                </Box>
                <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>
                  {model.modelName || "-"}
                </Typography>
              </Box>
            </TableCell>

            {/* PROVIDER */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
              }}
            >
              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: directColors.bg,
                  borderRadius: "4px",
                  px: "8px",
                  py: "3px",
                }}
              >
                <ProviderChipIcon Icon={direct.Icon} size={13} />
                <Typography sx={{ fontSize: "12px", fontWeight: 500, color: directColors.text }}>
                  {direct.displayName}
                </Typography>
              </Box>
            </TableCell>

            {/* DATE ADDED - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                textTransform: "none",
                verticalAlign: "middle",
              }}
            >
              <Typography sx={{ fontSize: "13px", color: `${status.default.text}` }}>
                {formatTimestamp(model.updatedAt, formatDate)}
              </Typography>
            </TableCell>

            {/* ACTION - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                minWidth: 40,
                maxWidth: 40,
                verticalAlign: "middle",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <IconButton
                size="small"
                onClick={(e) => openModelMenu(e, model)}
                sx={{
                  "color": `${text.icon}`,
                  "padding": "6px",
                  "&:hover": {
                    backgroundColor: `${background.hover}`,
                  },
                }}
              >
                <MoreVertical size={18} />
              </IconButton>
            </TableCell>
          </TableRow>
        );
      })}

      {/* Action Menu */}
      <Popover
        open={Boolean(menuAnchorEl)}
        anchorEl={menuAnchorEl}
        onClose={closeModelMenu}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        sx={{
          "& .MuiPopover-paper": {
            minWidth: 120,
            borderRadius: "4px",
            border: `1px solid ${borderPalette.dark}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            overflow: "hidden",
            mt: 0.5,
            p: 1,
          },
        }}
      >
        <Stack spacing={1}>
          {onDelete && (
            <CustomizableButton
              variant="outlined"
              color="error"
              size="medium"
              onClick={deleteModelRow}
              startIcon={<Trash2 size={14} />}
            >
              Delete
            </CustomizableButton>
          )}
        </Stack>
      </Popover>
    </TableBody>
  );
};

export default ModelsTableBody;
