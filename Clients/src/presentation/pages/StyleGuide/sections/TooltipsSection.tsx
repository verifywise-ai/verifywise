import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar, Tooltip } from "@mui/material";
import { Copy, Info, HelpCircle } from "lucide-react";
import { EnhancedTooltip } from "../../../components/EnhancedTooltip";
import CodeBlock from "../components/CodeBlock";

const tooltipSnippets = {
  muiBasic: `import { Tooltip } from "@mui/material";

<Tooltip title="Helpful information" arrow>
  <IconButton>
    <HelpCircle size={16} />
  </IconButton>
</Tooltip>`,
  muiPlacements: `// Tooltip placements
<Tooltip title="Top" placement="top">...</Tooltip>
<Tooltip title="Right" placement="right">...</Tooltip>
<Tooltip title="Bottom" placement="bottom">...</Tooltip>
<Tooltip title="Left" placement="left">...</Tooltip>`,
  enhanced: `import EnhancedTooltip from "../EnhancedTooltip";

<EnhancedTooltip
  title="Feature Overview"
  content={
    <Box>
      <Typography>Detailed explanation here...</Typography>
      <ul>
        <li>Point one</li>
        <li>Point two</li>
      </ul>
    </Box>
  }
>
  <Info size={16} />
</EnhancedTooltip>`,
};

const TooltipsSection: React.FC = () => {
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
          Tooltips
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Simple tooltips using MUI Tooltip and rich content tooltips using EnhancedTooltip.
        </Typography>
      </Box>

      {/* MUI Tooltip */}
      <SpecSection title="MUI Tooltip">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard tooltips for short help text. Use for icon buttons and brief explanations.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Basic tooltip"
                code={tooltipSnippets.muiBasic}
                onCopy={handleCopy}
              >
                <Box sx={{ display: "flex", gap: "24px", alignItems: "center" }}>
                  <Tooltip title="This is helpful information" arrow>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        p: "8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        color: theme.palette.text.tertiary,
                        "&:hover": {
                          backgroundColor: theme.palette.background.fill,
                        },
                      }}
                    >
                      <HelpCircle size={20} />
                    </Box>
                  </Tooltip>
                  <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                    Hover over the icon to see tooltip
                  </Typography>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="Tooltip placements"
                code={tooltipSnippets.muiPlacements}
                onCopy={handleCopy}
              >
                <Box sx={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  {(["top", "right", "bottom", "left"] as const).map((placement) => (
                    <Tooltip key={placement} title={`Tooltip on ${placement}`} placement={placement} arrow>
                      <Box
                        sx={{
                          px: "12px",
                          py: "6px",
                          border: `1px solid ${theme.palette.border.light}`,
                          borderRadius: "4px",
                          fontSize: 12,
                          cursor: "pointer",
                          "&:hover": {
                            borderColor: theme.palette.primary.main,
                          },
                        }}
                      >
                        {placement}
                      </Box>
                    </Tooltip>
                  ))}
                </Box>
              </ExampleWithCode>
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              MUI Tooltip specs
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Font size", value: "11px" },
                { property: "Padding", value: "4px 8px" },
                { property: "Background", value: "#1c2130" },
                { property: "Color", value: "background.main" },
                { property: "Border radius", value: "4px" },
                { property: "Max width", value: "300px" },
                { property: "Arrow", value: "arrow prop" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* EnhancedTooltip */}
      <SpecSection title="EnhancedTooltip">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Rich content tooltip with dark glassmorphic design. Supports custom React content, close button, and persists on hover.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Enhanced tooltip with rich content"
                code={tooltipSnippets.enhanced}
                onCopy={handleCopy}
              >
                <Box sx={{ display: "flex", gap: "24px", alignItems: "center" }}>
                  <EnhancedTooltip
                    title="Feature Overview"
                    content={
                      <Box>
                        <Typography sx={{ fontSize: 13, mb: "8px" }}>
                          This feature allows you to:
                        </Typography>
                        <Box component="ul" sx={{ m: 0, pl: "16px" }}>
                          <li>Track compliance progress</li>
                          <li>Generate reports</li>
                          <li>Manage risk assessments</li>
                        </Box>
                      </Box>
                    }
                  >
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        p: "8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                        color: theme.palette.text.tertiary,
                        "&:hover": {
                          backgroundColor: theme.palette.background.fill,
                          color: theme.palette.primary.main,
                        },
                      }}
                    >
                      <Info size={20} />
                    </Box>
                  </EnhancedTooltip>
                  <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                    Hover to see rich tooltip with title and content
                  </Typography>
                </Box>
              </ExampleWithCode>
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              EnhancedTooltip props
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "children", value: "ReactNode (trigger)" },
                { property: "title", value: "string" },
                { property: "content", value: "ReactNode" },
              ]}
            />

            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", mt: "24px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              EnhancedTooltip specs
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Max width", value: "420px" },
                { property: "Border radius", value: "4px" },
                { property: "Box shadow", value: "0 8px 32px rgba(0,0,0,0.3)" },
                { property: "Background", value: "linear-gradient(135deg, #1f1f23, #252530)" },
                { property: "Padding", value: "24px" },
                { property: "Title size", value: "15px" },
                { property: "Title weight", value: "600" },
                { property: "Content size", value: "13px" },
                { property: "Content line height", value: "1.6" },
                { property: "Text color", value: "rgba(255,255,255,0.85)" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Tooltip Design Preview */}
      <SpecSection title="EnhancedTooltip design preview">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Static preview of the EnhancedTooltip styling.
        </Typography>

        <Box
          sx={{
            display: "inline-block",
            background: "linear-gradient(135deg, #1f1f23 0%, #252530 100%)",
            padding: "24px",
            borderRadius: "4px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            maxWidth: "420px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              color: "rgba(255, 255, 255, 0.6)",
              "&:hover": {
                color: "background.main",
                backgroundColor: "rgba(255, 255, 255, 0.1)",
              },
            }}
          >
            ×
          </Box>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: "15px",
              color: "background.main",
              letterSpacing: "-0.02em",
              mb: 2,
              pr: 3,
            }}
          >
            Tooltip Title
          </Typography>
          <Box
            sx={{
              height: "1px",
              background: "rgba(255, 255, 255, 0.1)",
              mb: 2,
            }}
          />
          <Box
            sx={{
              color: "rgba(255, 255, 255, 0.85)",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            This is the tooltip content area. It supports rich content including lists, links, and formatted text.
          </Box>
          <Box
            sx={{
              position: "absolute",
              bottom: -30,
              right: -30,
              width: 100,
              height: 100,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(19, 113, 91, 0.2) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
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
            "Use MUI Tooltip for simple, short help text (icon buttons, abbreviations)",
            "Use EnhancedTooltip for rich content (lists, formatted text, detailed explanations)",
            "Always add arrow prop to MUI Tooltip for better visual connection",
            "EnhancedTooltip stays open while user hovers over it (for reading long content)",
            "EnhancedTooltip includes close button for explicit dismissal",
            "Prefer placement='top' or 'bottom' to avoid viewport clipping issues",
            "Keep tooltip text concise - use EnhancedTooltip for longer explanations",
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

const SpecTable: React.FC<{
  specs: { property: string; value: string }[];
  onCopy: (text: string) => void;
}> = ({ specs, onCopy }) => {
  const theme = useTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        overflow: "hidden",
      }}
    >
      {specs.map((spec, index) => (
        <Box
          key={index}
          onClick={() => onCopy(spec.value)}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: "10px 14px",
            borderBottom:
              index < specs.length - 1
                ? `1px solid ${theme.palette.border.light}`
                : "none",
            cursor: "pointer",
            transition: "background-color 150ms ease",
            "&:hover": {
              backgroundColor: theme.palette.background.fill,
            },
          }}
        >
          <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
            {spec.property}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 500,
                color: theme.palette.text.primary,
                fontFamily: "monospace",
              }}
            >
              {spec.value}
            </Typography>
            {hoveredIndex === index && (
              <Copy size={12} color={theme.palette.primary.main} />
            )}
          </Box>
        </Box>
      ))}
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
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: theme.palette.text.secondary }}>
          {label}
        </Typography>
        <Box
          onClick={() => setShowCode(!showCode)}
          sx={{
            fontSize: 11,
            color: showCode ? theme.palette.primary.main : theme.palette.text.tertiary,
            cursor: "pointer",
            "&:hover": { color: theme.palette.primary.main },
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

export default TooltipsSection;
