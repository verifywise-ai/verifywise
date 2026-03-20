import { useState } from "react";
import { Box, Typography, Divider, Tooltip, useTheme } from "@mui/material";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Columns2,
  Columns3,
  Palette,
  Type,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import Select from "../../components/Inputs/Select";
import { FormDesignSettings, DEFAULT_DESIGN_SETTINGS } from "./types";
import { brand, text, background } from "../../themes/palette";

interface DesignPanelProps {
  settings: FormDesignSettings;
  onChange: (settings: FormDesignSettings) => void;
}

const FONT_OPTIONS = [
  { _id: "Inter", name: "Inter" },
  { _id: "Geist", name: "Geist" },
  { _id: "Roboto", name: "Roboto" },
  { _id: "Arial", name: "Arial" },
  { _id: "Georgia", name: "Georgia" },
  { _id: "Verdana", name: "Verdana" },
];

const THEME_COLORS = [
  `${brand.primary}`, `${brand.primaryHover}`, "#1976D2", "#2E7D32", "#C62828",
  "#AD1457", "#6A1B9A", "#283593", "#00695C", "#EF6C00",
  "#4E342E", "#37474F", `${text.black}`, "#546E7A",
];

const BG_COLORS = [
  "#fafafa", `${background.main}`, `${background.surface}`, "#f0f4f8", "#fdf2f8",
  "#f0fdf4", "#fef3c7", "#ecfeff", "#f5f3ff", "#fef2f2",
  "#e8f5e9", "#e3f2fd", "#fff3e0", "#f3e5f5",
];

function IconToggleButton({
  active,
  onClick,
  children,
  title,
  sxOverride,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  sxOverride?: Record<string, unknown>;
}) {
  const theme = useTheme();
  return (
    <Tooltip title={title} arrow placement="top">
      <Box
        onClick={onClick}
        sx={{
          width: 36,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "4px",
          cursor: "pointer",
          border: active ? `1px solid ${theme.palette.primary.main}80` : `1px solid ${theme.palette.border.dark}`,
          backgroundColor: active ? theme.palette.background.fill : theme.palette.background.main,
          color: active ? theme.palette.primary.main : theme.palette.text.tertiary,
          transition: "all 0.15s ease",
          "&:hover": {
            borderColor: active ? `${theme.palette.primary.main}80` : theme.palette.text.accent,
            backgroundColor: active ? theme.palette.background.fill : theme.palette.background.accent,
          },
          ...sxOverride,
        }}
      >
        {children}
      </Box>
    </Tooltip>
  );
}

function CustomizeRow({
  icon,
  label,
  preview,
  expanded,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  preview?: React.ReactNode;
  expanded?: boolean;
  onClick?: () => void;
}) {
  const theme = useTheme();
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        py: "8px",
        px: "4px",
        borderRadius: "4px",
        cursor: "pointer",
        "&:hover": { backgroundColor: theme.palette.background.accent },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {icon}
        <Typography sx={{ fontSize: "12px", color: theme.palette.text.secondary }}>
          {label}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
        {preview}
        {expanded ? (
          <ChevronDown size={14} color={theme.palette.text.accent} />
        ) : (
          <ChevronRight size={14} color={theme.palette.text.accent} />
        )}
      </Box>
    </Box>
  );
}

function ColorSwatch({ color }: { color: string }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: 16,
        height: 16,
        borderRadius: "4px",
        backgroundColor: color,
        border: `1px solid ${theme.palette.border.dark}`,
        flexShrink: 0,
      }}
    />
  );
}

function ColorGrid({
  colors,
  selected,
  onSelect,
  showCustom,
  customValue,
  onCustomChange,
}: {
  colors: string[];
  selected: string;
  onSelect: (color: string) => void;
  showCustom?: boolean;
  customValue?: string;
  onCustomChange?: (color: string) => void;
}) {
  const theme = useTheme();
  return (
    <Box sx={{ px: "4px", pb: "8px" }}>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          mb: showCustom ? "8px" : 0,
        }}
      >
        {colors.map((color) => (
          <Box
            key={color}
            onClick={() => onSelect(color)}
            sx={{
              width: 24,
              height: 24,
              borderRadius: "4px",
              backgroundColor: color,
              border:
                selected === color
                  ? `2px solid ${theme.palette.primary.main}`
                  : `1px solid ${theme.palette.border.dark}`,
              cursor: "pointer",
              transition: "all 0.1s ease",
              "&:hover": {
                transform: "scale(1.15)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              },
            }}
          />
        ))}
      </Box>
      {showCustom && (
        <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Typography sx={{ fontSize: "11px", color: theme.palette.other.icon }}>
            Custom
          </Typography>
          <Box
            component="input"
            type="color"
            value={customValue || brand.primary}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onCustomChange?.(e.target.value)
            }
            sx={{
              width: 28,
              height: 22,
              border: `1px solid ${theme.palette.border.dark}`,
              borderRadius: "4px",
              cursor: "pointer",
              padding: 0,
              backgroundColor: "transparent",
              "&::-webkit-color-swatch-wrapper": { padding: "2px" },
              "&::-webkit-color-swatch": {
                borderRadius: "2px",
                border: "none",
              },
            }}
          />
          <Typography sx={{ fontSize: "11px", color: theme.palette.text.accent, fontFamily: "monospace" }}>
            {customValue || brand.primary}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function DesignPanel({ settings, onChange }: DesignPanelProps) {
  const theme = useTheme();
  const s = settings ?? DEFAULT_DESIGN_SETTINGS;
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const update = (patch: Partial<FormDesignSettings>) => {
    onChange({ ...s, ...patch });
  };

  const toggleSection = (section: string) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  return (
    <Box
      sx={{
        width: 325,
        borderLeft: `1px solid ${theme.palette.border.dark}`,
        backgroundColor: theme.palette.background.main,
        overflowY: "auto",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: "8px",
          py: "8px",
          borderBottom: `1px solid ${theme.palette.border.dark}`,
        }}
      >
        <Typography
          sx={{ fontSize: "13px", fontWeight: 600, color: theme.palette.text.primary }}
        >
          Design
        </Typography>
      </Box>

      <Box sx={{ p: "12px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Format */}
        <Box>
          <Typography
            sx={{ fontSize: "11px", fontWeight: 600, color: theme.palette.text.tertiary, mb: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}
          >
            Format
          </Typography>
          <Box sx={{ display: "flex", gap: "6px" }}>
            <IconToggleButton
              active={s.format === "narrow"}
              onClick={() => update({ format: "narrow" })}
              title="Narrow"
            >
              <Columns2 size={16} />
            </IconToggleButton>
            <IconToggleButton
              active={s.format === "wide"}
              onClick={() => update({ format: "wide" })}
              title="Wide"
            >
              <Columns3 size={16} />
            </IconToggleButton>
          </Box>
        </Box>

        {/* Alignment */}
        <Box>
          <Typography
            sx={{ fontSize: "11px", fontWeight: 600, color: theme.palette.text.tertiary, mb: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}
          >
            Alignment
          </Typography>
          <Box sx={{ display: "flex", gap: "6px" }}>
            <IconToggleButton
              active={s.alignment === "left"}
              onClick={() => update({ alignment: "left" })}
              title="Left"
            >
              <AlignLeft size={16} />
            </IconToggleButton>
            <IconToggleButton
              active={s.alignment === "center"}
              onClick={() => update({ alignment: "center" })}
              title="Center"
            >
              <AlignCenter size={16} />
            </IconToggleButton>
            <IconToggleButton
              active={s.alignment === "right"}
              onClick={() => update({ alignment: "right" })}
              title="Right"
            >
              <AlignRight size={16} />
            </IconToggleButton>
          </Box>
        </Box>

        <Divider sx={{ borderColor: theme.palette.border.light }} />

        {/* Customize */}
        <Box>
          <Typography
            sx={{ fontSize: "11px", fontWeight: 600, color: theme.palette.text.tertiary, mb: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}
          >
            Customize
          </Typography>

          {/* Color theme */}
          <CustomizeRow
            icon={<Palette size={14} color={theme.palette.text.tertiary} />}
            label="Color theme"
            preview={<ColorSwatch color={s.colorTheme} />}
            expanded={expandedSection === "colorTheme"}
            onClick={() => toggleSection("colorTheme")}
          />
          {expandedSection === "colorTheme" && (
            <ColorGrid
              colors={THEME_COLORS}
              selected={s.colorTheme}
              onSelect={(color) => update({ colorTheme: color })}
              showCustom
              customValue={s.colorTheme}
              onCustomChange={(color) => update({ colorTheme: color })}
            />
          )}

          {/* Background */}
          <CustomizeRow
            icon={<Palette size={14} color={theme.palette.text.tertiary} />}
            label="Background"
            preview={<ColorSwatch color={s.backgroundColor} />}
            expanded={expandedSection === "backgroundColor"}
            onClick={() => toggleSection("backgroundColor")}
          />
          {expandedSection === "backgroundColor" && (
            <ColorGrid
              colors={BG_COLORS}
              selected={s.backgroundColor}
              onSelect={(color) => update({ backgroundColor: color })}
              showCustom
              customValue={s.backgroundColor}
              onCustomChange={(color) => update({ backgroundColor: color })}
            />
          )}

          {/* Font */}
          <CustomizeRow
            icon={<Type size={14} color={theme.palette.text.tertiary} />}
            label="Font"
            preview={
              <Typography sx={{ fontSize: "11px", color: theme.palette.other.icon }}>
                {s.fontFamily}
              </Typography>
            }
            expanded={expandedSection === "font"}
            onClick={() => toggleSection("font")}
          />
          {expandedSection === "font" && (
            <Box sx={{ px: "4px", pb: "8px" }}>
              <Select
                id="design-font-inline"
                label=""
                value={s.fontFamily}
                onChange={(e) => update({ fontFamily: String(e.target.value) })}
                items={FONT_OPTIONS}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    height: 34,
                    fontSize: "12px",
                  },
                }}
              />
            </Box>
          )}
        </Box>

      </Box>
    </Box>
  );
}
