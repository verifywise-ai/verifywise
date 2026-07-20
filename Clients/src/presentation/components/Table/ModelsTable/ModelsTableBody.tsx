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
import { text, background, border as borderPalette, status } from "../../../themes/palette";
import { displayFormattedDateTime } from "../../../tools/isoDateToString";

interface ModelsTableBodyProps {
  rows: ModelRow[];
  page: number;
  rowsPerPage: number;
  onRowClick?: (model: ModelRow) => void;
  onDelete?: (model: ModelRow) => void;
}

const formatDate = (dateStr?: string | null): string => {
  if (!dateStr) return "-";
  return displayFormattedDateTime(dateStr);
};

// Provider color mapping for chips
const getProviderColor = (provider: string): { bg: string; text: string } => {
  const colors: Record<string, { bg: string; text: string }> = {
    openai: { bg: "#E8F5E9", text: "#2E7D32" },
    anthropic: { bg: "#FFF3E0", text: "#E65100" },
    google: { bg: "#E3F2FD", text: "#1565C0" },
    mistral: { bg: "#F3E5F5", text: "#7B1FA2" },
    ollama: { bg: "#ECEFF1", text: "#37474F" },
    huggingface: { bg: "#FFF8E1", text: "#F57F17" },
    xai: { bg: "#FAFAFA", text: "#212121" },
    bedrock: { bg: "#FFF3E0", text: "#FF6F00" },
    meta: { bg: "#E8F0FE", text: "#1A56DB" },
    deepseek: { bg: "#EDE8FD", text: "#5B21B6" },
    microsoft: { bg: "#E3F2FD", text: "#0369A1" },
    cohere: { bg: "#FFF3E0", text: "#B45309" },
    perplexity: { bg: "#F0FDF4", text: "#15803D" },
    nvidia: { bg: "#F0FDF4", text: "#166534" },
    qwen: { bg: "#FFF7ED", text: "#C2410C" },
    moonshot: { bg: "#F5F3FF", text: "#6D28D9" },
  };
  return colors[provider.toLowerCase()] || { bg: `${background.surface}`, text: "#616161" };
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
                textAlign: "center",
              }}
            >
              <Box
                sx={{ display: "inline-flex", alignItems: "center", gap: "8px", textAlign: "left" }}
              >
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
                {formatDate(model.updatedAt)}
              </Typography>
            </TableCell>

            {/* ACTION - center aligned */}
            <TableCell
              sx={{
                ...singleTheme.tableStyles.primary.body.cell,
                textAlign: "center",
                minWidth: "80px",
                maxWidth: "80px",
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
              onClick={deleteModelRow}
              startIcon={<Trash2 size={14} />}
              sx={{
                "height": "34px",
                "fontSize": "13px",
                "fontWeight": 500,
                "color": "#DC2626",
                "borderColor": `${borderPalette.dark}`,
                "backgroundColor": "transparent",
                "justifyContent": "flex-start",
                "&:hover": {
                  backgroundColor: "#FEF2F2",
                  borderColor: "#DC2626",
                },
              }}
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
