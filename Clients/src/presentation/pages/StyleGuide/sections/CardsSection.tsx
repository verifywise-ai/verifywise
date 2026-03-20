import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";
import CodeBlock from "../components/CodeBlock";
import { background, status } from "../../../themes/palette";

const cardCodeSnippet = `<Box
  sx={{
    backgroundColor: theme.palette.background.main,
    border: \`1px solid \${theme.palette.border.light}\`,
    borderRadius: "4px",
    p: "16px",
  }}
>
  <Typography sx={{ fontSize: 16, fontWeight: 600 }}>
    Card title
  </Typography>
  <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary }}>
    Card content goes here
  </Typography>
</Box>`;

const alertCodeSnippet = `<Box
  sx={{
    backgroundColor: theme.palette.status.success.bg,
    border: \`1px solid \${theme.palette.status.success.main}\`,
    borderRadius: "4px",
    p: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  }}
>
  <CheckCircle size={16} color={theme.palette.status.success.text} />
  <Typography sx={{ fontSize: 13, color: theme.palette.status.success.text }}>
    Success message here
  </Typography>
</Box>`;

const CardsSection: React.FC = () => {
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
          Cards & containers
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Container components for grouping content. Includes cards, panels, alert boxes, and
          other container elements.
        </Typography>
      </Box>

      {/* Card Specifications */}
      <SpecSection title="Card specifications">
        <SpecGrid>
          <SpecCard title="Background" value={background.main} note="theme.palette.background.main" onCopy={handleCopy} />
          <SpecCard title="Border" value="1px solid #eaecf0" note="theme.palette.border.light" onCopy={handleCopy} />
          <SpecCard title="Border radius" value="4px" note="Standard radius" onCopy={handleCopy} />
          <SpecCard title="Padding" value="16px" note="Standard card padding" onCopy={handleCopy} />
          <SpecCard title="Shadow" value="none" note="Default no shadow" onCopy={handleCopy} />
          <SpecCard title="Hover shadow" value="0px 4px 24px -4px rgba(16, 24, 40, 0.08)" note="On interactive cards" onCopy={handleCopy} />
        </SpecGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Basic Card Example */}
      <SpecSection title="Basic card">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard card container with border and padding.
        </Typography>

        <ExampleWithCode
          label="Standard card"
          code={cardCodeSnippet}
          onCopy={handleCopy}
        >
          <Box
            sx={{
              backgroundColor: theme.palette.background.main,
              border: `1px solid ${theme.palette.border.light}`,
              borderRadius: "4px",
              p: "16px",
            }}
          >
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 600,
                color: theme.palette.text.primary,
                mb: "8px",
              }}
            >
              Card title
            </Typography>
            <Typography
              sx={{
                fontSize: 13,
                color: theme.palette.text.tertiary,
              }}
            >
              This is the card content. Cards are used to group related information together
              in a visually distinct container.
            </Typography>
          </Box>
        </ExampleWithCode>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Card Variants */}
      <SpecSection title="Card variants">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Different card styles for various use cases.
        </Typography>

        <Stack spacing="24px">
          {/* Elevated Card */}
          <Box>
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
              Elevated card
            </Typography>
            <Box
              sx={{
                backgroundColor: theme.palette.background.main,
                border: `1px solid ${theme.palette.border.light}`,
                borderRadius: "4px",
                p: "16px",
                boxShadow: "0px 4px 24px -4px rgba(16, 24, 40, 0.08), 0px 3px 3px -3px rgba(16, 24, 40, 0.03)",
              }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.palette.text.primary, mb: "4px" }}>
                Elevated card with shadow
              </Typography>
              <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary }}>
                Used for floating elements or cards that need visual prominence.
              </Typography>
            </Box>
          </Box>

          {/* Interactive Card */}
          <Box>
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
              Interactive card
            </Typography>
            <Box
              sx={{
                backgroundColor: theme.palette.background.main,
                border: `1px solid ${theme.palette.border.light}`,
                borderRadius: "4px",
                p: "16px",
                cursor: "pointer",
                transition: "all 150ms ease",
                "&:hover": {
                  borderColor: theme.palette.primary.main,
                  boxShadow: "0px 4px 24px -4px rgba(16, 24, 40, 0.08)",
                },
              }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.palette.text.primary, mb: "4px" }}>
                Clickable card
              </Typography>
              <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary }}>
                Hover to see the interaction effect. Used for selectable items.
              </Typography>
            </Box>
          </Box>

          {/* Alt Background Card */}
          <Box>
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
              Alt background card
            </Typography>
            <Box
              sx={{
                backgroundColor: theme.palette.background.alt,
                border: `1px solid ${theme.palette.border.light}`,
                borderRadius: "4px",
                p: "16px",
              }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.palette.text.primary, mb: "4px" }}>
                Alternate background
              </Typography>
              <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary }}>
                Uses background.alt (#FCFCFD) for subtle differentiation.
              </Typography>
            </Box>
          </Box>

          {/* Accent Background Card */}
          <Box>
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
              Accent background card
            </Typography>
            <Box
              sx={{
                backgroundColor: theme.palette.background.accent,
                border: `1px solid ${theme.palette.border.light}`,
                borderRadius: "4px",
                p: "16px",
              }}
            >
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: theme.palette.text.primary, mb: "4px" }}>
                Accent background
              </Typography>
              <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary }}>
                Uses background.accent (background.accent) for checklists, tips, and secondary content.
              </Typography>
            </Box>
          </Box>
        </Stack>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Alert Boxes */}
      <SpecSection title="Alert boxes">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Status-colored containers for feedback messages, notifications, and alerts.
        </Typography>

        <Stack spacing="16px" sx={{ mb: "24px" }}>
          {/* Success Alert */}
          <Box
            sx={{
              backgroundColor: "#E6F4EA",
              border: "1px solid status.success.text",
              borderRadius: "4px",
              p: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <CheckCircle size={16} color={status.success.text} />
            <Typography sx={{ fontSize: 13, color: "status.success.text" }}>
              Success! Your changes have been saved.
            </Typography>
          </Box>

          {/* Error Alert */}
          <Box
            sx={{
              backgroundColor: "#FFD6D6",
              border: "1px solid status.error.text",
              borderRadius: "4px",
              p: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <AlertCircle size={16} color={status.error.text} />
            <Typography sx={{ fontSize: 13, color: "status.error.text" }}>
              Error: Something went wrong. Please try again.
            </Typography>
          </Box>

          {/* Warning Alert */}
          <Box
            sx={{
              backgroundColor: "#FFF8E1",
              border: "1px solid #795548",
              borderRadius: "4px",
              p: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <AlertTriangle size={16} color="#795548" />
            <Typography sx={{ fontSize: 13, color: "#795548" }}>
              Warning: This action cannot be undone.
            </Typography>
          </Box>

          {/* Info Alert */}
          <Box
            sx={{
              backgroundColor: "#E3F2FD",
              border: "1px solid #1565C0",
              borderRadius: "4px",
              p: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <Info size={16} color="#1565C0" />
            <Typography sx={{ fontSize: 13, color: "#1565C0" }}>
              Info: Here's some additional information.
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ borderRadius: "4px", overflow: "hidden", border: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={alertCodeSnippet} language="tsx" onCopy={handleCopy} />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Alert Specifications */}
      <SpecSection title="Alert specifications">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Color tokens for each alert type.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "16px",
            "@media (max-width: 1000px)": {
              gridTemplateColumns: "repeat(2, 1fr)",
            },
          }}
        >
          <AlertColorCard
            type="Success"
            bgColor="#E6F4EA"
            borderColor={status.success.text}
            textColor={status.success.text}
            onCopy={handleCopy}
          />
          <AlertColorCard
            type="Error"
            bgColor="#FFD6D6"
            borderColor={status.error.text}
            textColor={status.error.text}
            onCopy={handleCopy}
          />
          <AlertColorCard
            type="Warning"
            bgColor="#FFF8E1"
            borderColor="#795548"
            textColor="#795548"
            onCopy={handleCopy}
          />
          <AlertColorCard
            type="Info"
            bgColor="#E3F2FD"
            borderColor="#1565C0"
            textColor="#1565C0"
            onCopy={handleCopy}
          />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Panel Specifications */}
      <SpecSection title="Panel specifications">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Larger container specifications for page sections and modals.
        </Typography>

        <SpecGrid>
          <SpecCard title="Modal bg" value="#FCFCFD" note="theme.palette.background.modal" onCopy={handleCopy} />
          <SpecCard title="Modal shadow" value="0px 4px 24px -4px rgba(16, 24, 40, 0.08)" note="theme.boxShadow" onCopy={handleCopy} />
          <SpecCard title="Modal border" value="1px solid #eaecf0" note="Light border" onCopy={handleCopy} />
          <SpecCard title="Section padding" value="24px" note="Large section padding" onCopy={handleCopy} />
          <SpecCard title="Drawer width" value="400px" note="Side drawer default" onCopy={handleCopy} />
          <SpecCard title="Dialog max-width" value="600px" note="Standard dialog" onCopy={handleCopy} />
        </SpecGrid>
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
            "Use border-radius: 4px for all cards and containers",
            "Standard card border: 1px solid theme.palette.border.light (borderPalette.light)",
            "Use theme.palette.background.main for standard cards",
            "Use theme.palette.background.alt for subtle differentiation",
            "Apply hover states with borderColor change to primary.main for interactive cards",
            "Alert boxes use status colors from theme.palette.status.*",
            "Include icons (16px) with 12px gap in alert boxes",
            "Modal background uses theme.palette.background.modal",
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

const SpecGrid: React.FC<{ children: React.ReactNode; columns?: number }> = ({
  children,
  columns = 4,
}) => {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: "16px",
        "@media (max-width: 1200px)": {
          gridTemplateColumns: "repeat(3, 1fr)",
        },
        "@media (max-width: 900px)": {
          gridTemplateColumns: "repeat(2, 1fr)",
        },
      }}
    >
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

const AlertColorCard: React.FC<{
  type: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  onCopy: (text: string) => void;
}> = ({ type, bgColor, borderColor, textColor, onCopy }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          height: 40,
          backgroundColor: bgColor,
          borderBottom: `2px solid ${borderColor}`,
        }}
      />
      <Box sx={{ p: "12px", backgroundColor: theme.palette.background.alt }}>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "8px",
          }}
        >
          {type}
        </Typography>
        <Stack spacing="4px">
          <CopyableValue label="bg" value={bgColor} onCopy={onCopy} />
          <CopyableValue label="border" value={borderColor} onCopy={onCopy} />
          <CopyableValue label="text" value={textColor} onCopy={onCopy} />
        </Stack>
      </Box>
    </Box>
  );
};

const CopyableValue: React.FC<{
  label: string;
  value: string;
  onCopy: (text: string) => void;
}> = ({ label, value, onCopy }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box
      onClick={() => onCopy(value)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: "2px",
        backgroundColor: isHovered ? theme.palette.background.fill : "transparent",
      }}
    >
      <Typography sx={{ fontSize: 10, color: theme.palette.text.accent }}>
        {label}:
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <Typography sx={{ fontSize: 10, fontFamily: "monospace", color: theme.palette.text.secondary }}>
          {value}
        </Typography>
        {isHovered && <Copy size={10} color={theme.palette.primary.main} />}
      </Box>
    </Box>
  );
};

const ExampleWithCode: React.FC<{
  label: string;
  code: string;
  onCopy: (text: string) => void;
  children: React.ReactNode;
}> = ({ label, code, onCopy, children }) => {
  const theme = useTheme();
  const [showCode, setShowCode] = useState(true);

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          p: "8px 12px",
          backgroundColor: theme.palette.background.alt,
          borderBottom: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 500,
            color: theme.palette.text.secondary,
          }}
        >
          {label}
        </Typography>
        <Box
          onClick={() => setShowCode(!showCode)}
          sx={{
            fontSize: 11,
            color: showCode ? theme.palette.primary.main : theme.palette.text.tertiary,
            cursor: "pointer",
            "&:hover": {
              color: theme.palette.primary.main,
            },
          }}
        >
          {showCode ? "Hide code" : "Show code"}
        </Box>
      </Box>

      <Box sx={{ p: "16px", backgroundColor: theme.palette.background.main }}>
        {children}
      </Box>

      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default CardsSection;
