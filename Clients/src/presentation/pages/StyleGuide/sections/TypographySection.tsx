import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy } from "lucide-react";
import { brand, text, background } from "../../../themes/palette";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  textStyles,
} from "../../../themes/typography";

/** Format a textStyles entry for StyleGuide display chips */
const styleMeta = (style: {
  fontSize: number;
  fontWeight: number;
  lineHeight: number | string;
}) => ({
  fontSize: `${style.fontSize}px`,
  fontWeight: String(style.fontWeight),
  lineHeight: String(style.lineHeight),
});

const TypographySection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <Box sx={{ p: "32px 40px" }}>
      <Snackbar
        open={!!copiedText}
        autoHideDuration={2000}
        onClose={() => setCopiedText(null)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

      {/* Page Header */}
      <Box sx={{ mb: "32px" }}>
        <Typography
          sx={{
            ...textStyles.pageTitle,
            color: theme.palette.text.primary,
            mb: "8px",
          }}
        >
          Typography
        </Typography>
        <Typography
          sx={{
            ...textStyles.bodyLarge,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Typography styles and text hierarchy from <code>themes/typography.ts</code>. Primary stack
          is Geist with system fallbacks (no Inter).
        </Typography>
      </Box>

      {/* Font Family */}
      <SpecSection title="Font family">
        <Box
          sx={{
            display: "flex",
            gap: "24px",
            flexWrap: "wrap",
          }}
        >
          <SpecCard
            title="Primary font"
            value="Geist"
            note="Main font for all UI"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Font stack"
            value={fontFamily.sans}
            note="fontFamily.sans"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Monospace"
            value={fontFamily.mono}
            note="fontFamily.mono"
            onCopy={handleCopy}
          />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Heading Styles */}
      <SpecSection title="Headings">
        <Typography
          sx={{ fontSize: fontSize.base, color: theme.palette.text.tertiary, mb: "24px" }}
        >
          Semantic styles: textStyles.pageTitle, sectionTitle, cardTitle, subsectionTitle
        </Typography>

        <Stack spacing="24px">
          <TypographyExample
            label="Page title (textStyles.pageTitle)"
            {...styleMeta(textStyles.pageTitle)}
            color="#1c2130"
            example="Dashboard overview"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Section title (textStyles.sectionTitle)"
            {...styleMeta(textStyles.sectionTitle)}
            color="#1c2130"
            example="Risk management"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Card title (textStyles.cardTitle)"
            {...styleMeta(textStyles.cardTitle)}
            color="#1c2130"
            example="Compliance status"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Subsection title (textStyles.subsectionTitle)"
            {...styleMeta(textStyles.subsectionTitle)}
            color="#1c2130"
            example="Filter options"
            onCopy={handleCopy}
          />
        </Stack>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Body Text */}
      <SpecSection title="Body text">
        <Typography
          sx={{ fontSize: fontSize.base, color: theme.palette.text.tertiary, mb: "24px" }}
        >
          Standard text sizes for body content. Modal descriptions and sidebar/tab labels use body
          (13), not bodySmall.
        </Typography>

        <Stack spacing="24px">
          <TypographyExample
            label="Body large (textStyles.bodyLarge)"
            {...styleMeta(textStyles.bodyLarge)}
            color={text.secondary}
            example="This is body text used for longer form content and descriptions that require more space."
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Body default (textStyles.body)"
            {...styleMeta(textStyles.body)}
            color={text.secondary}
            example="Standard body text for most UI content, modal descriptions, and tab labels."
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Body small (textStyles.bodySmall)"
            {...styleMeta(textStyles.bodySmall)}
            color={text.tertiary}
            example="Smaller text for secondary information and metadata."
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Caption (textStyles.caption)"
            {...styleMeta(textStyles.caption)}
            color="#838c99"
            example="Caption text for hints, timestamps, and footnotes"
            onCopy={handleCopy}
          />
        </Stack>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Font Weights */}
      <SpecSection title="Font weights">
        <Typography
          sx={{ fontSize: fontSize.base, color: theme.palette.text.tertiary, mb: "24px" }}
        >
          Tokens: fontWeight.regular / medium / semibold / bold
        </Typography>

        <Box
          sx={{
            "display": "grid",
            "gridTemplateColumns": "repeat(4, 1fr)",
            "gap": "16px",
            "@media (max-width: 900px)": {
              gridTemplateColumns: "repeat(2, 1fr)",
            },
          }}
        >
          <WeightCard
            weight={String(fontWeight.regular)}
            name="Regular"
            usage="Body text"
            onCopy={handleCopy}
          />
          <WeightCard
            weight={String(fontWeight.medium)}
            name="Medium"
            usage="Labels, buttons"
            onCopy={handleCopy}
          />
          <WeightCard
            weight={String(fontWeight.semibold)}
            name="Semibold"
            usage="Headings, emphasis"
            onCopy={handleCopy}
          />
          <WeightCard
            weight={String(fontWeight.bold)}
            name="Bold"
            usage="Strong emphasis"
            onCopy={handleCopy}
          />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Common UI Text */}
      <SpecSection title="Common UI text styles">
        <Typography
          sx={{ fontSize: fontSize.base, color: theme.palette.text.tertiary, mb: "24px" }}
        >
          Specific text styles used for common UI elements (from textStyles.*).
        </Typography>

        <Stack spacing="24px">
          <TypographyExample
            label="Button text (textStyles.button)"
            {...styleMeta(textStyles.button)}
            color={background.main}
            example="Save changes"
            onCopy={handleCopy}
            bgColor={brand.primary}
          />
          <TypographyExample
            label="Form label (textStyles.formLabel)"
            {...styleMeta(textStyles.formLabel)}
            color={text.secondary}
            example="Email address"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Input text (textStyles.input)"
            {...styleMeta(textStyles.input)}
            color="#1c2130"
            example="user@example.com"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Placeholder"
            {...styleMeta(textStyles.input)}
            color="#838c99"
            example="Enter your email..."
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Error message (textStyles.error)"
            {...styleMeta(textStyles.error)}
            color="#f04438"
            example="This field is required"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Table header (textStyles.tableHeader)"
            {...styleMeta(textStyles.tableHeader)}
            color={text.tertiary}
            example="NAME"
            textTransform="uppercase"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Table cell (textStyles.tableCell)"
            {...styleMeta(textStyles.tableCell)}
            color={text.secondary}
            example="John Doe"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Badge text (textStyles.badge)"
            {...styleMeta(textStyles.badge)}
            color="#079455"
            example="Active"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Tooltip (textStyles.tooltip)"
            {...styleMeta(textStyles.tooltip)}
            color={background.main}
            example="Click to view details"
            onCopy={handleCopy}
            bgColor="#1c2130"
          />
        </Stack>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Line Heights */}
      <SpecSection title="Line heights">
        <Typography
          sx={{ fontSize: fontSize.base, color: theme.palette.text.tertiary, mb: "24px" }}
        >
          Tokens from lineHeight.* in typography.ts
        </Typography>

        <Box
          sx={{
            "display": "grid",
            "gridTemplateColumns": "repeat(5, 1fr)",
            "gap": "16px",
            "@media (max-width: 900px)": {
              gridTemplateColumns: "repeat(2, 1fr)",
            },
          }}
        >
          <SpecCard
            title="Tight"
            value={String(lineHeight.tight)}
            note="lineHeight.tight"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Snug"
            value={String(lineHeight.snug)}
            note="Page titles"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Normal"
            value={String(lineHeight.normal)}
            note="Default for most text"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Relaxed"
            value={String(lineHeight.relaxed)}
            note="Body text, paragraphs"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Loose"
            value={String(lineHeight.loose)}
            note="Long-form content"
            onCopy={handleCopy}
          />
        </Box>
      </SpecSection>

      {/* Developer Checklist */}
      <Box
        sx={{
          mt: "40px",
          p: "24px",
          backgroundColor: theme.palette.background.accent,
          borderRadius: "4px",
          border: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Typography
          sx={{
            fontSize: fontSize.md,
            fontWeight: fontWeight.semibold,
            color: theme.palette.text.primary,
            mb: "16px",
          }}
        >
          Developer checklist
        </Typography>
        <Stack spacing="8px">
          {[
            "Import tokens from themes/typography.ts (fontSize, textStyles) — do not invent sizes",
            `Base UI text is fontSize.base (${fontSize.base}px); modal description and sidebar/tab labels use textStyles.body`,
            "Use fontWeight.medium for labels/buttons, fontWeight.semibold for headings",
            "Font stack is Geist via fontFamily.sans / theme.typography.fontFamily (no Inter)",
            "Text colors should come from theme.palette.text.*",
            "Error text: textStyles.error + theme.palette.status.error.text",
            "Never use MUI Typography variants (h1-h6) — use textStyles or fontSize/fontWeight tokens",
            "Form labels: textStyles.formLabel with color text.secondary",
          ].map((item, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: theme.palette.primary.main,
                  mt: "6px",
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
};

// Helper Components

const SpecSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ mb: "16px" }}>
      <Typography
        sx={{
          fontSize: 18,
          fontWeight: 600,
          color: theme.palette.text.primary,
          mb: "16px",
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
};

const SpecCard: React.FC<{
  title: string;
  value: string;
  note?: string;
  onCopy: (text: string) => void;
}> = ({ title, value, note, onCopy }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box
      onClick={() => onCopy(value)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        "p": "16px",
        "backgroundColor": theme.palette.background.alt,
        "borderRadius": "4px",
        "border": `1px solid ${theme.palette.border.light}`,
        "cursor": "pointer",
        "transition": "border-color 150ms ease",
        "position": "relative",
        "flex": 1,
        "minWidth": 200,
        "&:hover": {
          borderColor: theme.palette.primary.main,
        },
      }}
    >
      {isHovered && (
        <Box
          sx={{
            position: "absolute",
            top: "8px",
            right: "8px",
            color: theme.palette.primary.main,
          }}
        >
          <Copy size={14} />
        </Box>
      )}
      <Typography
        sx={{
          fontSize: 11,
          color: theme.palette.text.tertiary,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          mb: "4px",
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 600,
          color: theme.palette.text.primary,
          fontFamily: "monospace",
          wordBreak: "break-all",
        }}
      >
        {value}
      </Typography>
      {note && (
        <Typography
          sx={{
            fontSize: 11,
            color: theme.palette.text.accent,
            mt: "4px",
          }}
        >
          {note}
        </Typography>
      )}
    </Box>
  );
};

const TypographyExample: React.FC<{
  label: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  example: string;
  textTransform?: string;
  bgColor?: string;
  onCopy: (text: string) => void;
}> = ({
  label,
  fontSize,
  fontWeight,
  lineHeight,
  color,
  example,
  textTransform,
  bgColor,
  onCopy,
}) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          p: "12px 16px",
          backgroundColor: theme.palette.background.alt,
          borderBottom: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.palette.text.primary,
          }}
        >
          {label}
        </Typography>
        <Box sx={{ display: "flex", gap: "16px" }}>
          <SpecChip label="Size" value={fontSize} onCopy={onCopy} />
          <SpecChip label="Weight" value={fontWeight} onCopy={onCopy} />
          <SpecChip label="Line height" value={lineHeight} onCopy={onCopy} />
          <SpecChip label="Color" value={color} onCopy={onCopy} />
        </Box>
      </Box>

      {/* Example */}
      <Box
        sx={{
          p: "20px",
          backgroundColor: bgColor || theme.palette.background.main,
        }}
      >
        <Typography
          sx={{
            fontSize,
            fontWeight,
            lineHeight,
            color,
            textTransform: textTransform || "none",
          }}
        >
          {example}
        </Typography>
      </Box>
    </Box>
  );
};

const SpecChip: React.FC<{
  label: string;
  value: string;
  onCopy: (text: string) => void;
}> = ({ label, value, onCopy }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box
      onClick={(e) => {
        e.stopPropagation();
        onCopy(value);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "4px",
        cursor: "pointer",
        padding: "2px 6px",
        borderRadius: "2px",
        backgroundColor: isHovered ? theme.palette.background.fill : "transparent",
        transition: "background-color 150ms ease",
      }}
    >
      <Typography sx={{ fontSize: 10, color: theme.palette.text.accent }}>{label}:</Typography>
      <Typography
        sx={{ fontSize: 11, fontFamily: "monospace", color: theme.palette.text.secondary }}
      >
        {value}
      </Typography>
      {isHovered && <Copy size={10} color={theme.palette.primary.main} />}
    </Box>
  );
};

const WeightCard: React.FC<{
  weight: string;
  name: string;
  usage: string;
  onCopy: (text: string) => void;
}> = ({ weight, name, usage, onCopy }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box
      onClick={() => onCopy(weight)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        "p": "20px",
        "backgroundColor": theme.palette.background.alt,
        "borderRadius": "4px",
        "border": `1px solid ${theme.palette.border.light}`,
        "cursor": "pointer",
        "transition": "border-color 150ms ease",
        "position": "relative",
        "textAlign": "center",
        "&:hover": {
          borderColor: theme.palette.primary.main,
        },
      }}
    >
      {isHovered && (
        <Box
          sx={{
            position: "absolute",
            top: "8px",
            right: "8px",
            color: theme.palette.primary.main,
          }}
        >
          <Copy size={14} />
        </Box>
      )}
      <Typography
        sx={{
          fontSize: 32,
          fontWeight: parseInt(weight),
          color: theme.palette.text.primary,
          mb: "8px",
        }}
      >
        Aa
      </Typography>
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 600,
          color: theme.palette.text.primary,
          mb: "4px",
        }}
      >
        {name}
      </Typography>
      <Typography
        sx={{
          fontSize: 12,
          fontFamily: "monospace",
          color: theme.palette.text.accent,
          mb: "8px",
        }}
      >
        {weight}
      </Typography>
      <Typography
        sx={{
          fontSize: 11,
          color: theme.palette.text.tertiary,
        }}
      >
        {usage}
      </Typography>
    </Box>
  );
};

export default TypographySection;
