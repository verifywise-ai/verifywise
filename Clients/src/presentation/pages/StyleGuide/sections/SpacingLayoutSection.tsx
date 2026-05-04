import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar } from "@mui/material";
import { Copy } from "lucide-react";
import CodeBlock from "../components/CodeBlock";

const spacingSnippets = {
  themeSpacing: `// MUI theme.spacing() - base unit is 2px
theme.spacing(1)   // 2px
theme.spacing(2)   // 4px
theme.spacing(4)   // 8px
theme.spacing(8)   // 16px
theme.spacing(12)  // 24px
theme.spacing(16)  // 32px
theme.spacing(20)  // 40px`,
  commonPadding: `// Common padding patterns
padding: "8px 12px"      // Buttons, small inputs
padding: "12px 16px"     // Cards, containers
padding: "16px 20px"     // Page sections
padding: "24px 32px"     // Modal content
padding: "32px 40px"     // Page content`,
  gaps: `// Stack/Flex gap values
gap: "4px"    // Tight grouping (icon + text)
gap: "8px"    // Related items (form fields)
gap: "12px"   // Section items
gap: "16px"   // Cards in grid
gap: "24px"   // Major sections
gap: "32px"   // Page sections`,
  layoutMixins: `import { layoutMixins } from "../themes/mixins";

// Flex utilities
<Box sx={layoutMixins.flexCenter()}>Centered</Box>
<Box sx={layoutMixins.flexBetween()}>Space between</Box>
<Box sx={layoutMixins.flexStart()}>Align start</Box>
<Box sx={layoutMixins.container(theme)}>Full width with padding</Box>`,
};

const SpacingLayoutSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Spacing scale based on theme.spacing(2) = 2px base
  const spacingScale = [
    { multiplier: 1, value: "2px", usage: "Micro spacing, icon gaps" },
    { multiplier: 2, value: "4px", usage: "Tight spacing, padding small" },
    { multiplier: 4, value: "8px", usage: "Default gap, button padding" },
    { multiplier: 6, value: "12px", usage: "Card padding, field spacing" },
    { multiplier: 8, value: "16px", usage: "Section spacing, large gaps" },
    { multiplier: 10, value: "20px", usage: "Container padding" },
    { multiplier: 12, value: "24px", usage: "Modal padding, major spacing" },
    { multiplier: 16, value: "32px", usage: "Page padding, section margins" },
    { multiplier: 20, value: "40px", usage: "Large page padding" },
  ];

  const commonMargins = [
    { property: 'mb: "4px"', usage: "Label to input" },
    { property: 'mb: "8px"', usage: "Title to subtitle" },
    { property: 'mb: "16px"', usage: "Section header to content" },
    { property: 'mb: "24px"', usage: "Section to section" },
    { property: 'mb: "32px"', usage: "Page header to content" },
    { property: 'mt: "40px"', usage: "Footer/checklist sections" },
  ];

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
          Spacing & layout
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Consistent spacing scale and layout patterns used throughout VerifyWise. Based on MUI
          theme.spacing() with a 2px base unit.
        </Typography>
      </Box>

      {/* Spacing Scale */}
      <SpecSection title="Spacing scale">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          VerifyWise uses theme.spacing(n) where the base unit is 2px. Use these consistent values
          instead of arbitrary pixel values.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Theme spacing reference"
              code={spacingSnippets.themeSpacing}
              onCopy={handleCopy}
            >
              <Box
                sx={{
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                <Stack spacing="16px">
                  {spacingScale.map((item) => (
                    <Box
                      key={item.multiplier}
                      sx={{ display: "flex", alignItems: "center", gap: "16px" }}
                    >
                      <Box
                        sx={{
                          width: 60,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 12,
                            fontFamily: "monospace",
                            color: theme.palette.text.secondary,
                          }}
                        >
                          spacing({item.multiplier})
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: parseInt(item.value),
                          height: 16,
                          backgroundColor: theme.palette.primary.main,
                          borderRadius: "2px",
                          minWidth: 2,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: theme.palette.text.primary,
                          minWidth: 40,
                        }}
                      >
                        {item.value}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                        {item.usage}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </ExampleWithCode>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                mb: "16px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Base configuration
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Base unit", value: "2px" },
                { property: "Theme config", value: "spacing: 2" },
                { property: "Calculation", value: "theme.spacing(n) = n × 2px" },
              ]}
            />

            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                mb: "16px",
                mt: "24px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Most common values
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "8px", value: "Buttons, inputs, tight gaps" },
                { property: "12px", value: "Card padding, form fields" },
                { property: "16px", value: "Section gaps, standard spacing" },
                { property: "24px", value: "Modal content, major sections" },
                { property: "32px", value: "Page padding" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Common Padding Patterns */}
      <SpecSection title="Common padding patterns">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard padding values used across different component types.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Padding by component type"
              code={spacingSnippets.commonPadding}
              onCopy={handleCopy}
            >
              <Box
                sx={{
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                <Stack spacing="16px">
                  <PaddingDemo label="Button/Input" padding="8px 12px" />
                  <PaddingDemo label="Card/Container" padding="12px 16px" />
                  <PaddingDemo label="Page section" padding="16px 20px" />
                  <PaddingDemo label="Modal content" padding="24px 32px" />
                  <PaddingDemo label="Page content" padding="32px 40px" />
                </Stack>
              </Box>
            </ExampleWithCode>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                mb: "16px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Common margin patterns
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={commonMargins.map((m) => ({ property: m.property, value: m.usage }))}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Gap Values */}
      <SpecSection title="Gap values">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Use gap property for consistent spacing in flex and grid layouts.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode label="Gap scale" code={spacingSnippets.gaps} onCopy={handleCopy}>
              <Box
                sx={{
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                <Stack spacing="20px">
                  <GapDemo gap="4px" label="4px - Icon + text" />
                  <GapDemo gap="8px" label="8px - Related items" />
                  <GapDemo gap="12px" label="12px - Section items" />
                  <GapDemo gap="16px" label="16px - Card grid" />
                  <GapDemo gap="24px" label="24px - Major sections" />
                </Stack>
              </Box>
            </ExampleWithCode>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                mb: "16px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Gap recommendations
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Icon + label", value: "4px" },
                { property: "Form fields", value: "8px" },
                { property: "List items", value: "8-12px" },
                { property: "Card grid", value: "16px" },
                { property: "Page sections", value: "24-32px" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Layout Mixins */}
      <SpecSection title="Layout mixins">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Pre-built layout patterns from the theme mixins for consistent layouts.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Layout utilities"
              code={spacingSnippets.layoutMixins}
              onCopy={handleCopy}
            >
              <Box
                sx={{
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                <Stack spacing="16px">
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      p: "12px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.light}`,
                      borderRadius: "4px",
                    }}
                  >
                    <Typography sx={{ fontSize: 12 }}>flexCenter()</Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      p: "12px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.light}`,
                      borderRadius: "4px",
                    }}
                  >
                    <Typography sx={{ fontSize: 12 }}>Left</Typography>
                    <Typography sx={{ fontSize: 12 }}>flexBetween()</Typography>
                    <Typography sx={{ fontSize: 12 }}>Right</Typography>
                  </Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: "8px",
                      p: "12px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.light}`,
                      borderRadius: "4px",
                    }}
                  >
                    <Typography sx={{ fontSize: 12 }}>flexStart()</Typography>
                    <Typography sx={{ fontSize: 12 }}>Item 2</Typography>
                    <Typography sx={{ fontSize: 12 }}>Item 3</Typography>
                  </Box>
                </Stack>
              </Box>
            </ExampleWithCode>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: theme.palette.text.secondary,
                mb: "16px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Available mixins
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "layoutMixins.flexCenter()", value: "Center both axes" },
                { property: "layoutMixins.flexBetween()", value: "Space between" },
                { property: "layoutMixins.flexStart()", value: "Align to start" },
                { property: "layoutMixins.fullHeight()", value: "height: 100%" },
                { property: "layoutMixins.container(theme)", value: "Full width + padding" },
              ]}
            />
          </Box>
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
            "Use theme.spacing(n) instead of arbitrary pixel values",
            "Prefer gap over margin for spacing between flex/grid children",
            "Use consistent padding patterns: 8px small, 16px medium, 24px large",
            "Import layoutMixins for common flex patterns",
            "Page content padding should be 32px 40px",
            "Modal content padding should be 24px",
            "Form field vertical spacing should be 8px",
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

// Demo Components

const PaddingDemo: React.FC<{ label: string; padding: string }> = ({ label, padding }) => {
  const theme = useTheme();
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
      <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary, minWidth: 100 }}>
        {label}
      </Typography>
      <Box
        sx={{
          padding,
          backgroundColor: theme.palette.background.main,
          border: `1px solid ${theme.palette.border.dark}`,
          borderRadius: "4px",
        }}
      >
        <Box
          sx={{
            backgroundColor: theme.palette.primary.main,
            color: "white",
            fontSize: 10,
            px: "8px",
            py: "2px",
            borderRadius: "2px",
          }}
        >
          {padding}
        </Box>
      </Box>
    </Box>
  );
};

const GapDemo: React.FC<{ gap: string; label: string }> = ({ gap, label }) => {
  const theme = useTheme();
  return (
    <Box>
      <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary, mb: "4px" }}>
        {label}
      </Typography>
      <Box sx={{ display: "flex", gap, alignItems: "center" }}>
        {[1, 2, 3].map((n) => (
          <Box
            key={n}
            sx={{
              width: 40,
              height: 24,
              backgroundColor: theme.palette.primary.main,
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: 10,
            }}
          >
            {n}
          </Box>
        ))}
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
    <Box sx={{ mb: "40px" }}>
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
              index < specs.length - 1 ? `1px solid ${theme.palette.border.light}` : "none",
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
            {hoveredIndex === index && <Copy size={12} color={theme.palette.primary.main} />}
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

      <Box sx={{ backgroundColor: theme.palette.background.main }}>{children}</Box>

      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default SpacingLayoutSection;
