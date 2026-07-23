import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy } from "lucide-react";

const ColorsSection: React.FC = () => {
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
            fontSize: 24,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "8px",
          }}
        >
          Colors
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          The VerifyWise color palette. All colors are defined in the theme and should be accessed
          via theme.palette. Click any color to copy its hex value.
        </Typography>
      </Box>

      {/* Primary Colors */}
      <SpecSection title="Primary colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Main brand colors used for primary actions and key UI elements.
        </Typography>
        <ColorGrid>
          <ColorCard
            label="Primary"
            color="#13715B"
            usage="Main action buttons, links, focus states"
            themeKey="theme.palette.primary.main"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Primary hover"
            color="#0f604d"
            usage="Hover state for primary elements"
            themeKey="Custom (darken 15%)"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Primary light"
            color="#5FA896"
            usage="Hover borders, secondary accents"
            themeKey="Custom"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Primary focus ring"
            color="rgba(19,113,91,0.1)"
            usage="Focus box-shadow"
            themeKey="Custom rgba"
            onCopy={handleCopy}
          />
        </ColorGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Text Colors */}
      <SpecSection title="Text colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Typography colors for different hierarchy levels.
        </Typography>
        <ColorGrid>
          <ColorCard
            label="Primary text"
            color="#1c2130"
            usage="Main headings, important content"
            themeKey="theme.palette.text.primary"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Secondary text"
            color="#344054"
            usage="Body text, labels"
            themeKey="theme.palette.text.secondary"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Tertiary text"
            color="#475467"
            usage="Descriptions, placeholders"
            themeKey="theme.palette.text.tertiary"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Accent text"
            color="#838c99"
            usage="Muted text, hints"
            themeKey="theme.palette.text.accent"
            onCopy={handleCopy}
            textColor="#fff"
          />
        </ColorGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Background Colors */}
      <SpecSection title="Background colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Surface and container background colors.
        </Typography>
        <ColorGrid>
          <ColorCard
            label="Main background"
            color="#FFFFFF"
            usage="Page background, cards"
            themeKey="theme.palette.background.main"
            onCopy={handleCopy}
            hasBorder
          />
          <ColorCard
            label="Alt background"
            color="#FCFCFD"
            usage="Alternate surfaces"
            themeKey="theme.palette.background.alt"
            onCopy={handleCopy}
            hasBorder
          />
          <ColorCard
            label="Modal background"
            color="#FCFCFD"
            usage="Modal/dialog surfaces"
            themeKey="theme.palette.background.modal"
            onCopy={handleCopy}
            hasBorder
          />
          <ColorCard
            label="Fill background"
            color="#E6F0EC"
            usage="Hover states, filled inputs"
            themeKey="theme.palette.background.fill"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Accent background"
            color="#f9fafb"
            usage="Table headers, subtle fills"
            themeKey="theme.palette.background.accent"
            onCopy={handleCopy}
          />
        </ColorGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Border Colors */}
      <SpecSection title="Border colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Border and divider colors for UI elements.
        </Typography>
        <ColorGrid>
          <ColorCard
            label="Light border"
            color="#eaecf0"
            usage="Card borders, table rows"
            themeKey="theme.palette.border.light"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Dark border"
            color="#d0d5dd"
            usage="Input borders, stronger dividers"
            themeKey="theme.palette.border.dark"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Divider"
            color="#d0d5dd"
            usage="Section dividers"
            themeKey="theme.palette.divider"
            onCopy={handleCopy}
          />
        </ColorGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Status Colors */}
      <SpecSection title="Status colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Semantic colors for status indicators, alerts, and feedback.
        </Typography>

        {/* Success */}
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: theme.palette.text.secondary,
            mb: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Success
        </Typography>
        <ColorGrid columns={5} sx={{ mb: "24px" }}>
          <ColorCard
            label="Success text"
            color="#138A5E"
            usage="Success messages"
            themeKey="theme.palette.status.success.text"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Success main"
            color="#138A5E"
            usage="Success icons, indicators"
            themeKey="theme.palette.status.success.main"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Success light"
            color="#C8E6D0"
            usage="Success badges"
            themeKey="theme.palette.status.success.light"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Success bg"
            color="#E6F4EA"
            usage="Success backgrounds"
            themeKey="theme.palette.status.success.bg"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Success border"
            color="#C8E6D0"
            usage="Success borders"
            themeKey="theme.palette.status.success.border"
            onCopy={handleCopy}
          />
        </ColorGrid>

        {/* Error */}
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: theme.palette.text.secondary,
            mb: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Error
        </Typography>
        <ColorGrid columns={5} sx={{ mb: "24px" }}>
          <ColorCard
            label="Error text"
            color="#D32F2F"
            usage="Error messages"
            themeKey="theme.palette.status.error.text"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Error main"
            color="#D32F2F"
            usage="Error icons"
            themeKey="theme.palette.status.error.main"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Error light"
            color="#F5B8B8"
            usage="Error badges"
            themeKey="theme.palette.status.error.light"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Error bg"
            color="#FFD6D6"
            usage="Error backgrounds"
            themeKey="theme.palette.status.error.bg"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Error border"
            color="#F5B8B8"
            usage="Error input borders"
            themeKey="theme.palette.status.error.border"
            onCopy={handleCopy}
          />
        </ColorGrid>

        {/* Warning */}
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: theme.palette.text.secondary,
            mb: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Warning
        </Typography>
        <ColorGrid columns={5} sx={{ mb: "24px" }}>
          <ColorCard
            label="Warning text"
            color="#795548"
            usage="Warning messages"
            themeKey="theme.palette.status.warning.text"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Warning main"
            color="#795548"
            usage="Warning icons"
            themeKey="theme.palette.status.warning.main"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Warning light"
            color="#F5E6B8"
            usage="Warning badges"
            themeKey="theme.palette.status.warning.light"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Warning bg"
            color="#FFF8E1"
            usage="Warning backgrounds"
            themeKey="theme.palette.status.warning.bg"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Warning border"
            color="#F5E6B8"
            usage="Warning borders"
            themeKey="theme.palette.status.warning.border"
            onCopy={handleCopy}
          />
        </ColorGrid>

        {/* Info */}
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: theme.palette.text.secondary,
            mb: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Info / Default
        </Typography>
        <ColorGrid columns={5}>
          <ColorCard
            label="Info text"
            color="#1565C0"
            usage="Info messages"
            themeKey="theme.palette.status.info.text"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Info main"
            color="#1565C0"
            usage="Info icons"
            themeKey="theme.palette.status.info.main"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Info light"
            color="#BBDEFB"
            usage="Info badges"
            themeKey="theme.palette.status.info.light"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Info bg"
            color="#E3F2FD"
            usage="Info backgrounds"
            themeKey="theme.palette.status.info.bg"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Info border"
            color="#BBDEFB"
            usage="Info borders"
            themeKey="theme.palette.status.info.border"
            onCopy={handleCopy}
          />
        </ColorGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Button Colors */}
      <SpecSection title="Button colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Color palette for buttons. Each color has contained, outlined, and text variants.
        </Typography>
        <ColorGrid columns={6}>
          <ColorCard
            label="Primary"
            color="#13715B"
            usage="Main actions"
            themeKey="primary"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Secondary"
            color="#F4F4F4"
            usage="Utility actions"
            themeKey="secondary"
            onCopy={handleCopy}
            textColor="#475467"
          />
          <ColorCard
            label="Success"
            color="#138A5E"
            usage="Positive actions"
            themeKey="success"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Warning"
            color="#795548"
            usage="Caution actions"
            themeKey="warning"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Error"
            color="#D32F2F"
            usage="Destructive actions"
            themeKey="error"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Info"
            color="#1565C0"
            usage="Informational actions"
            themeKey="info"
            onCopy={handleCopy}
            textColor="#fff"
          />
        </ColorGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Other Colors */}
      <SpecSection title="Other colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Miscellaneous colors for icons, lines, and other UI elements.
        </Typography>
        <ColorGrid>
          <ColorCard
            label="Icon default"
            color="#667085"
            usage="Default icon color"
            themeKey="theme.palette.other.icon"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Line"
            color="#d6d9dd"
            usage="Decorative lines"
            themeKey="theme.palette.other.line"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Fill"
            color="#e3e3e3"
            usage="Generic fill color"
            themeKey="theme.palette.other.fill"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Grid"
            color="#a2a3a3"
            usage="Grid lines"
            themeKey="theme.palette.other.grid"
            onCopy={handleCopy}
          />
        </ColorGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Unresolved Colors */}
      <SpecSection title="Unresolved colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Colors for unresolved or pending states.
        </Typography>
        <ColorGrid columns={3}>
          <ColorCard
            label="Unresolved main"
            color="#4e5ba6"
            usage="Unresolved indicators"
            themeKey="theme.palette.unresolved.main"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Unresolved light"
            color="#e2eaf7"
            usage="Unresolved badges"
            themeKey="theme.palette.unresolved.light"
            onCopy={handleCopy}
          />
          <ColorCard
            label="Unresolved bg"
            color="#f2f4f7"
            usage="Unresolved backgrounds"
            themeKey="theme.palette.unresolved.bg"
            onCopy={handleCopy}
          />
        </ColorGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Tooltip Colors */}
      <SpecSection title="Tooltip colors">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Colors for tooltip components. Defined in theme component overrides.
        </Typography>
        <ColorGrid columns={3}>
          <ColorCard
            label="Tooltip background"
            color="#1F2937"
            usage="Tooltip surface"
            themeKey="MuiTooltip override"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Tooltip arrow"
            color="#1F2937"
            usage="Tooltip arrow"
            themeKey="MuiTooltip.arrow override"
            onCopy={handleCopy}
            textColor="#fff"
          />
          <ColorCard
            label="Tooltip text"
            color="#FFFFFF"
            usage="Tooltip text color"
            themeKey="Default (white)"
            onCopy={handleCopy}
            hasBorder
          />
        </ColorGrid>
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
            fontSize: 14,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "16px",
          }}
        >
          Developer checklist
        </Typography>
        <Stack spacing="8px">
          {[
            "Always use theme.palette.* for colors - never hardcode hex values",
            "Primary green #13715B is the main brand color",
            "Border color #d0d5dd should be used for all input borders",
            "Use status colors for feedback (success, error, warning)",
            "Background colors have semantic meanings - use appropriately",
            "Text hierarchy: primary > secondary > tertiary > accent",
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

const ColorGrid: React.FC<{ children: React.ReactNode; columns?: number; sx?: object }> = ({
  children,
  columns = 4,
  sx = {},
}) => {
  return (
    <Box
      sx={{
        "display": "grid",
        "gridTemplateColumns": `repeat(${columns}, 1fr)`,
        "gap": "16px",
        "@media (max-width: 1400px)": {
          gridTemplateColumns: "repeat(4, 1fr)",
        },
        "@media (max-width: 1100px)": {
          gridTemplateColumns: "repeat(3, 1fr)",
        },
        "@media (max-width: 800px)": {
          gridTemplateColumns: "repeat(2, 1fr)",
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
};

const ColorCard: React.FC<{
  label: string;
  color: string;
  usage: string;
  themeKey: string;
  onCopy: (text: string) => void;
  textColor?: string;
  hasBorder?: boolean;
}> = ({ label, color, usage, themeKey, onCopy, textColor = "#1c2130", hasBorder = false }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box
      onClick={() => onCopy(color)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        "cursor": "pointer",
        "borderRadius": "4px",
        "border": `1px solid ${theme.palette.border.light}`,
        "overflow": "hidden",
        "transition": "border-color 150ms ease",
        "&:hover": {
          borderColor: theme.palette.primary.main,
        },
      }}
    >
      {/* Color Swatch */}
      <Box
        sx={{
          height: 64,
          backgroundColor: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          border: hasBorder ? `1px solid ${theme.palette.border.light}` : "none",
        }}
      >
        {isHovered && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: textColor,
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            <Copy size={14} />
            Copy
          </Box>
        )}
      </Box>

      {/* Info */}
      <Box sx={{ p: "12px", backgroundColor: theme.palette.background.alt }}>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "2px",
          }}
        >
          {label}
        </Typography>
        <Typography
          sx={{
            fontSize: 12,
            fontFamily: "monospace",
            color: theme.palette.text.accent,
            mb: "6px",
          }}
        >
          {color}
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            color: theme.palette.text.tertiary,
            mb: "4px",
          }}
        >
          {usage}
        </Typography>
        <Typography
          sx={{
            fontSize: 10,
            color: theme.palette.text.accent,
            fontFamily: "monospace",
          }}
        >
          {themeKey}
        </Typography>
      </Box>
    </Box>
  );
};

export default ColorsSection;
