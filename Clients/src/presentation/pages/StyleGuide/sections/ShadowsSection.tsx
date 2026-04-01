import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar } from "@mui/material";
import { Copy } from "lucide-react";
import CodeBlock from "../components/CodeBlock";

const shadowSnippets = {
  themeShadow: `// Default theme shadow (dropdowns, popovers, cards)
const shadow = "0px 4px 24px -4px rgba(16, 24, 40, 0.08), 0px 3px 3px -3px rgba(16, 24, 40, 0.03)";

// Usage
<Box sx={{ boxShadow: theme.boxShadow }}>
  Content with shadow
</Box>`,
  cardShadow: `// No shadow for most cards (border-only style)
<Box
  sx={{
    border: \`1px solid \${theme.palette.border.dark}\`,
    borderRadius: "4px",
    boxShadow: "none",
  }}
>
  Border-only card
</Box>

// Shadow on hover
<Box
  sx={{
    border: \`1px solid \${theme.palette.border.dark}\`,
    transition: "box-shadow 0.2s ease",
    "&:hover": {
      boxShadow: theme.boxShadow,
    },
  }}
>
  Card with hover shadow
</Box>`,
  modalShadow: `// Modal/Dialog shadow
<Dialog
  PaperProps={{
    sx: {
      boxShadow: theme.boxShadow,
    },
  }}
>
  ...
</Dialog>`,
  skeletonShadow: `// SkeletonCard shadow (for empty states)
boxShadow: "0 8px 30px rgba(0,0,0,.08)"`,
};

const ShadowsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const shadowScale = [
    {
      name: "None",
      value: "none",
      usage: "Default cards, containers",
      css: "none",
    },
    {
      name: "Subtle",
      value: "0 1px 2px rgba(0,0,0,0.05)",
      usage: "Slight depth, inputs",
      css: "0 1px 2px rgba(0,0,0,0.05)",
    },
    {
      name: "Default",
      value: "theme.boxShadow",
      usage: "Dropdowns, popovers, modals",
      css: "0px 4px 24px -4px rgba(16, 24, 40, 0.08), 0px 3px 3px -3px rgba(16, 24, 40, 0.03)",
    },
    {
      name: "Skeleton",
      value: "0 8px 30px rgba(0,0,0,.08)",
      usage: "Empty state skeletons",
      css: "0 8px 30px rgba(0,0,0,.08)",
    },
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
          Shadows & elevation
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          VerifyWise uses a minimal shadow approach. Most components use borders
          for definition, with shadows reserved for floating elements.
        </Typography>
      </Box>

      {/* Shadow Scale */}
      <SpecSection title="Shadow scale">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          The application uses a flat design with borders as the primary visual separator.
          Shadows are used sparingly for floating elements.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              {shadowScale.map((shadow) => (
                <Box
                  key={shadow.name}
                  onClick={() => handleCopy(shadow.css)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "24px",
                    p: "16px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: theme.palette.background.accent,
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 80,
                      height: 60,
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.light}`,
                      borderRadius: "4px",
                      boxShadow: shadow.css,
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      sx={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: theme.palette.text.primary,
                        mb: "4px",
                      }}
                    >
                      {shadow.name}
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: theme.palette.text.tertiary,
                        mb: "4px",
                        wordBreak: "break-all",
                      }}
                    >
                      {shadow.value}
                    </Typography>
                    <Typography
                      sx={{ fontSize: 12, color: theme.palette.text.secondary }}
                    >
                      {shadow.usage}
                    </Typography>
                  </Box>
                  <Copy size={14} color={theme.palette.text.tertiary} />
                </Box>
              ))}
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Theme configuration
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "theme.boxShadow", value: "Default shadow token" },
                { property: "Border approach", value: "Primary visual style" },
                { property: "Shadow usage", value: "Floating elements only" },
              ]}
            />

            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", mt: "24px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              When to use shadows
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Dropdowns", value: "theme.boxShadow" },
                { property: "Popovers", value: "theme.boxShadow" },
                { property: "Modals", value: "theme.boxShadow" },
                { property: "Toasts", value: "theme.boxShadow" },
                { property: "Cards", value: "none (border only)" },
                { property: "Hover state", value: "Optional shadow" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Usage Examples */}
      <SpecSection title="Usage examples">
        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Theme shadow usage"
                code={shadowSnippets.themeShadow}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <Box
                    sx={{
                      p: "16px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.light}`,
                      borderRadius: "4px",
                      boxShadow: theme.boxShadow,
                    }}
                  >
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.primary }}>
                      Dropdown/Popover with theme.boxShadow
                    </Typography>
                  </Box>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="Card styling (border vs shadow)"
                code={shadowSnippets.cardShadow}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                    display: "flex",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <Box
                    sx={{
                      flex: "1 1 150px",
                      p: "16px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.dark}`,
                      borderRadius: "4px",
                      boxShadow: "none",
                    }}
                  >
                    <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                      Border only (default)
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      flex: "1 1 150px",
                      p: "16px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.dark}`,
                      borderRadius: "4px",
                      boxShadow: "none",
                      transition: "box-shadow 0.2s ease",
                      cursor: "pointer",
                      "&:hover": {
                        boxShadow: theme.boxShadow,
                      },
                    }}
                  >
                    <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                      Hover for shadow
                    </Typography>
                  </Box>
                </Box>
              </ExampleWithCode>
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Border tokens (primary style)
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "border.light", value: "borderPalette.light" },
                { property: "border.dark", value: "borderPalette.dark" },
                { property: "Border radius", value: "4px" },
                { property: "Border width", value: "1px" },
              ]}
            />

            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", mt: "24px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Elevation levels
            </Typography>
            <Box
              sx={{
                p: "16px",
                backgroundColor: theme.palette.background.alt,
                borderRadius: "4px",
                border: `1px solid ${theme.palette.border.light}`,
              }}
            >
              <Stack spacing="8px">
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  <strong>Level 0:</strong> Page content (no shadow)
                </Typography>
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  <strong>Level 1:</strong> Cards, containers (border only)
                </Typography>
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  <strong>Level 2:</strong> Dropdowns, popovers (shadow)
                </Typography>
                <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                  <strong>Level 3:</strong> Modals, dialogs (shadow)
                </Typography>
              </Stack>
            </Box>
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
            "Use borders as the primary visual separator, not shadows",
            "Use theme.boxShadow for floating elements (dropdowns, modals)",
            "Cards should use border only - boxShadow: \"none\"",
            "Add shadow on hover for interactive cards if needed",
            "Keep shadows subtle - VerifyWise uses a flat design",
            "MuiButton has disableElevation by default",
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

      <Box sx={{ backgroundColor: theme.palette.background.main }}>
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

export default ShadowsSection;
