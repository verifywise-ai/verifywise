import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar } from "@mui/material";
import { Copy } from "lucide-react";
import CodeBlock from "../components/CodeBlock";

const zIndexSnippets = {
  scale: `// Z-Index scale used in VerifyWise
const zIndex = {
  background: -1,      // Background decorations
  base: 0,             // Default stacking
  raised: 1,           // Slightly elevated elements
  dropdown: 10,        // Dropdowns, sticky headers
  sticky: 100,         // Sticky elements
  modal: 1000,         // Modals, overlays
  toast: 9999,         // Toasts, alerts (top priority)
};`,
  usage: `// Background decoration (login page)
<Box sx={{ zIndex: -1, position: "absolute" }}>
  Background pattern
</Box>

// Sticky header
<Box sx={{ position: "sticky", top: 0, zIndex: 100 }}>
  Header
</Box>

// Modal overlay
<Box sx={{ position: "fixed", zIndex: 1000 }}>
  Modal content
</Box>

// Toast notification
<Box sx={{ position: "fixed", zIndex: 9999 }}>
  Toast message
</Box>`,
  muiDefaults: `// MUI default z-index values (theme.zIndex)
mobileStepper: 1000
fab: 1050
speedDial: 1050
appBar: 1100
drawer: 1200
modal: 1300
snackbar: 1400
tooltip: 1500`,
};

const ZIndexSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const zIndexScale = [
    {
      name: "Background",
      value: -1,
      usage: "Decorative backgrounds, patterns",
      color: theme.palette.grey[300],
    },
    { name: "Base", value: 0, usage: "Default document flow", color: theme.palette.grey[400] },
    {
      name: "Raised",
      value: 1,
      usage: "Slightly elevated elements, overlapping items",
      color: theme.palette.grey[500],
    },
    {
      name: "Dropdown",
      value: 10,
      usage: "Dropdown menus, sticky table headers",
      color: theme.palette.info.main,
    },
    {
      name: "Sticky",
      value: 100,
      usage: "Sticky headers, fixed sidebars",
      color: theme.palette.warning.main,
    },
    {
      name: "Modal",
      value: 1000,
      usage: "Modals, dialogs, overlays",
      color: theme.palette.error.main,
    },
    {
      name: "Toast",
      value: 9999,
      usage: "Toasts, alerts, top-priority notifications",
      color: theme.palette.primary.main,
    },
  ];

  const componentZIndex = [
    { component: "Background decorations", value: "-1" },
    { component: "Table sticky header", value: "10" },
    { component: "Dropdown/Popover", value: "MUI default" },
    { component: "Modal/Dialog", value: "1000" },
    { component: "Drawer", value: "MUI default (1200)" },
    { component: "Toast (CustomizableToast)", value: "9999" },
    { component: "Alert toast", value: "9999" },
    { component: "Loading overlay", value: "9999" },
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
          Z-Index scale
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Layering system for managing stacking order of overlapping elements. Use consistent
          z-index values to ensure predictable layering.
        </Typography>
      </Box>

      {/* Z-Index Scale */}
      <SpecSection title="Layering scale">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          VerifyWise uses a simplified z-index scale. Higher values appear above lower values.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode label="Z-Index scale" code={zIndexSnippets.scale} onCopy={handleCopy}>
              <Box
                sx={{
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                {/* Visual Stack */}
                <Box
                  sx={{
                    position: "relative",
                    height: 280,
                    mb: "24px",
                  }}
                >
                  {zIndexScale.map((item, index) => (
                    <Box
                      key={item.name}
                      onClick={() => handleCopy(item.value.toString())}
                      sx={{
                        "position": "absolute",
                        "left": index * 20,
                        "bottom": index * 36,
                        "width": `calc(100% - ${index * 40}px)`,
                        "height": 40,
                        "backgroundColor": theme.palette.background.main,
                        "border": `2px solid ${item.color}`,
                        "borderRadius": "4px",
                        "display": "flex",
                        "alignItems": "center",
                        "justifyContent": "space-between",
                        "px": "12px",
                        "cursor": "pointer",
                        "transition": "transform 0.2s ease",
                        "&:hover": {
                          transform: "scale(1.02)",
                          zIndex: 10000, // Bring hovered item to top
                        },
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: item.color,
                          }}
                        />
                        <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{item.name}</Typography>
                      </Box>
                      <Typography
                        sx={{
                          fontSize: 12,
                          fontFamily: "monospace",
                          color: theme.palette.text.secondary,
                        }}
                      >
                        z-index: {item.value}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                {/* Legend */}
                <Stack spacing="8px">
                  {zIndexScale.map((item) => (
                    <Box
                      key={item.name}
                      sx={{ display: "flex", alignItems: "center", gap: "12px" }}
                    >
                      <Box
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: "2px",
                          backgroundColor: item.color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: theme.palette.text.primary,
                          minWidth: 50,
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
              Quick reference
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Background", value: "-1" },
                { property: "Base (default)", value: "0" },
                { property: "Raised/Overlap", value: "1" },
                { property: "Dropdown/Sticky header", value: "10" },
                { property: "Sticky elements", value: "100" },
                { property: "Modal/Overlay", value: "1000" },
                { property: "Toast/Alert", value: "9999" },
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
              Component z-index
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={componentZIndex.map((c) => ({
                property: c.component,
                value: c.value,
              }))}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Usage Examples */}
      <SpecSection title="Usage examples">
        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Common patterns"
              code={zIndexSnippets.usage}
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
                      p: "12px",
                      backgroundColor: theme.palette.grey[200],
                      borderRadius: "4px",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.03)",
                        zIndex: -1,
                      }}
                    />
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.secondary }}>
                      Background decoration (z-index: -1)
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: "12px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.dark}`,
                      borderRadius: "4px",
                    }}
                  >
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.secondary }}>
                      Sticky header example (z-index: 100)
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: "12px",
                      backgroundColor: theme.palette.background.main,
                      border: `1px solid ${theme.palette.border.dark}`,
                      borderRadius: "4px",
                      boxShadow: theme.boxShadow,
                    }}
                  >
                    <Typography sx={{ fontSize: 11, color: theme.palette.text.secondary }}>
                      Modal/Dialog (z-index: 1000)
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: "12px",
                      backgroundColor: theme.palette.text.primary,
                      borderRadius: "4px",
                    }}
                  >
                    <Typography sx={{ fontSize: 11, color: "white" }}>
                      Toast notification (z-index: 9999)
                    </Typography>
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
              MUI default z-index
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "mobileStepper", value: "1000" },
                { property: "fab", value: "1050" },
                { property: "appBar", value: "1100" },
                { property: "drawer", value: "1200" },
                { property: "modal", value: "1300" },
                { property: "snackbar", value: "1400" },
                { property: "tooltip", value: "1500" },
              ]}
            />

            <Box
              sx={{
                mt: "24px",
                p: "16px",
                backgroundColor: theme.palette.status.warning.bg,
                border: `1px solid ${theme.palette.status.warning.border}`,
                borderRadius: "4px",
              }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.palette.status.warning.text,
                  mb: "8px",
                }}
              >
                Note
              </Typography>
              <Typography sx={{ fontSize: 11, color: theme.palette.text.secondary }}>
                VerifyWise uses z-index: 9999 for toasts to ensure they appear above all MUI
                components including tooltips (1500).
              </Typography>
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
            "Use -1 for background decorations that should appear behind content",
            "Use 1 for elements that need to overlap siblings",
            "Use 10 for dropdown menus and sticky table headers",
            "Use 1000 for custom modals (or use MUI Dialog)",
            "Use 9999 for toasts and critical alerts",
            "Avoid arbitrary z-index values - use the established scale",
            "Remember: z-index only works with positioned elements",
            "MUI components handle their own z-index - don't override unless necessary",
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
            "display": "flex",
            "justifyContent": "space-between",
            "alignItems": "center",
            "p": "10px 14px",
            "borderBottom":
              index < specs.length - 1 ? `1px solid ${theme.palette.border.light}` : "none",
            "cursor": "pointer",
            "transition": "background-color 150ms ease",
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
            "fontSize": 11,
            "color": showCode ? theme.palette.primary.main : theme.palette.text.tertiary,
            "cursor": "pointer",
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

export default ZIndexSection;
