import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy } from "lucide-react";
import { brand, text, background } from "../../../themes/palette";

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
            fontSize: 24,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "8px",
          }}
        >
          Typography
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Typography styles and text hierarchy used in VerifyWise. All text uses the Geist font family
          with Inter as fallback, with consistent sizing and weights.
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
            value="'Geist', system-ui, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
            note="Full fallback chain"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Monospace"
            value="'Fira Code', 'Consolas', monospace"
            note="Code blocks"
            onCopy={handleCopy}
          />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Heading Styles */}
      <SpecSection title="Headings">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Page and section headings with consistent sizing and weights.
        </Typography>

        <Stack spacing="24px">
          <TypographyExample
            label="Page title"
            fontSize="24px"
            fontWeight="600"
            lineHeight="1.3"
            color="#1c2130"
            example="Dashboard overview"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Section title"
            fontSize="18px"
            fontWeight="600"
            lineHeight="1.4"
            color="#1c2130"
            example="Risk management"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Card title"
            fontSize="16px"
            fontWeight="600"
            lineHeight="1.4"
            color="#1c2130"
            example="Compliance status"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Subsection title"
            fontSize="14px"
            fontWeight="600"
            lineHeight="1.5"
            color="#1c2130"
            example="Filter options"
            onCopy={handleCopy}
          />
        </Stack>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Body Text */}
      <SpecSection title="Body text">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard text sizes for body content, labels, and supporting text.
        </Typography>

        <Stack spacing="24px">
          <TypographyExample
            label="Body large"
            fontSize="14px"
            fontWeight="400"
            lineHeight="1.5"
            color={text.secondary}
            example="This is body text used for longer form content and descriptions that require more space."
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Body default"
            fontSize="13px"
            fontWeight="400"
            lineHeight="1.5"
            color={text.secondary}
            example="Standard body text for most UI content and form labels."
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Body small"
            fontSize="12px"
            fontWeight="400"
            lineHeight="1.5"
            color={text.tertiary}
            example="Smaller text for secondary information and metadata."
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Caption"
            fontSize="11px"
            fontWeight="400"
            lineHeight="1.4"
            color="#838c99"
            example="Caption text for hints, timestamps, and footnotes"
            onCopy={handleCopy}
          />
        </Stack>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Font Weights */}
      <SpecSection title="Font weights">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard font weights used across the application.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "16px",
            "@media (max-width: 900px)": {
              gridTemplateColumns: "repeat(2, 1fr)",
            },
          }}
        >
          <WeightCard weight="400" name="Regular" usage="Body text" onCopy={handleCopy} />
          <WeightCard weight="500" name="Medium" usage="Labels, buttons" onCopy={handleCopy} />
          <WeightCard weight="600" name="Semibold" usage="Headings, emphasis" onCopy={handleCopy} />
          <WeightCard weight="700" name="Bold" usage="Strong emphasis" onCopy={handleCopy} />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Common UI Text */}
      <SpecSection title="Common UI text styles">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Specific text styles used for common UI elements.
        </Typography>

        <Stack spacing="24px">
          <TypographyExample
            label="Button text"
            fontSize="13px"
            fontWeight="500"
            lineHeight="1"
            color={background.main}
            example="Save changes"
            onCopy={handleCopy}
            bgColor={brand.primary}
          />
          <TypographyExample
            label="Form label"
            fontSize="13px"
            fontWeight="500"
            lineHeight="22px"
            color={text.secondary}
            example="Email address"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Input text"
            fontSize="13px"
            fontWeight="400"
            lineHeight="1.5"
            color="#1c2130"
            example="user@example.com"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Placeholder"
            fontSize="13px"
            fontWeight="400"
            lineHeight="1.5"
            color="#838c99"
            example="Enter your email..."
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Error message"
            fontSize="11px"
            fontWeight="400"
            lineHeight="1.4"
            color="#f04438"
            example="This field is required"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Table header"
            fontSize="12px"
            fontWeight="500"
            lineHeight="1.5"
            color={text.tertiary}
            example="NAME"
            textTransform="uppercase"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Table cell"
            fontSize="13px"
            fontWeight="400"
            lineHeight="1.5"
            color={text.secondary}
            example="John Doe"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Badge text"
            fontSize="12px"
            fontWeight="500"
            lineHeight="1"
            color="#079455"
            example="Active"
            onCopy={handleCopy}
          />
          <TypographyExample
            label="Tooltip"
            fontSize="13px"
            fontWeight="400"
            lineHeight="1.4"
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
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard line height values for different text contexts.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "16px",
            "@media (max-width: 900px)": {
              gridTemplateColumns: "repeat(2, 1fr)",
            },
          }}
        >
          <SpecCard title="Tight" value="1.2" note="Headings, titles" onCopy={handleCopy} />
          <SpecCard title="Normal" value="1.4" note="Default for most text" onCopy={handleCopy} />
          <SpecCard title="Relaxed" value="1.5" note="Body text, paragraphs" onCopy={handleCopy} />
          <SpecCard title="Loose" value="1.75" note="Long-form content" onCopy={handleCopy} />
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
            "Base font size is 13px for most UI text",
            "Use fontWeight 500 for labels and buttons, 600 for headings",
            "Always use Inter font family via theme.typography.fontFamily",
            "Text colors should come from theme.palette.text.*",
            "Error text: fontSize 11px, color theme.palette.status.error.text",
            "Never use MUI Typography variants (h1-h6) - use custom fontSize/fontWeight",
            "Form labels: fontSize 13px, fontWeight 500, color text.secondary",
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
        p: "16px",
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        cursor: "pointer",
        transition: "border-color 150ms ease",
        position: "relative",
        flex: 1,
        minWidth: 200,
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
}> = ({ label, fontSize, fontWeight, lineHeight, color, example, textTransform, bgColor, onCopy }) => {
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
      <Typography sx={{ fontSize: 10, color: theme.palette.text.accent }}>
        {label}:
      </Typography>
      <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: theme.palette.text.secondary }}>
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
        p: "20px",
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        cursor: "pointer",
        transition: "border-color 150ms ease",
        position: "relative",
        textAlign: "center",
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
