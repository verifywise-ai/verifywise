import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy, Inbox, ShieldAlert, Database, ListTodo } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import EmptyIllustration from "../../../components/EmptyState/EmptyIllustration";
import CodeBlock from "../components/CodeBlock";

const emptyStateSnippets = {
  basic: `import { EmptyState } from "../EmptyState";

<EmptyState />`,
  customMessage: `<EmptyState
  icon={Database}
  message="No datasets found. Add a dataset to get started."
/>`,
  withIcon: `import { ShieldAlert } from "lucide-react";

<EmptyState
  icon={ShieldAlert}
  message="No risks identified."
  showBorder={true}
/>`,
  illustration: `import EmptyIllustration from "../EmptyState/EmptyIllustration";
import { ListTodo } from "lucide-react";

<EmptyIllustration icon={ListTodo} />`,
};

const EmptyStatesSection: React.FC = () => {
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
          Empty states
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Components for displaying empty or no-data states in tables and lists.
          Uses an abstract SVG illustration with a contextual icon.
        </Typography>
      </Box>

      {/* EmptyState Component */}
      <SpecSection title="EmptyState component">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Reusable component for tables and lists when no data is available.
          Displays an abstract illustration with a contextual Lucide icon and a message.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Default empty state"
                code={emptyStateSnippets.basic}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <EmptyState />
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="With contextual icon"
                code={emptyStateSnippets.customMessage}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <EmptyState icon={Database} message="No datasets found. Add a dataset to get started." />
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="With border (standalone container)"
                code={emptyStateSnippets.withIcon}
                onCopy={handleCopy}
              >
                <EmptyState
                  icon={ShieldAlert}
                  message="No risks identified."
                  showBorder={true}
                />
              </ExampleWithCode>
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              EmptyState props
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "icon", value: "Inbox (default, any LucideIcon)" },
                { property: "message", value: '"There is currently no data..."' },
                { property: "imageAlt", value: '"No data available"' },
                { property: "showBorder", value: "false (default)" },
              ]}
            />

            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", mt: "24px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Styling specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Padding top", value: "48px" },
                { property: "Padding bottom", value: "24px (theme.spacing(12))" },
                { property: "Message font size", value: "13px" },
                { property: "Message font weight", value: "500" },
                { property: "Message max width", value: "360px" },
                { property: "Border (when shown)", value: "1px dashed borderPalette.dark" },
                { property: "Border radius", value: "4px" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* EmptyIllustration Component */}
      <SpecSection title="EmptyIllustration component">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standalone SVG illustration used inside EmptyState. Shows a teal circle with a contextual icon,
          dashed connector lines, and floating isometric cubes. Theme-aware colors for light and dark mode.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Different icons"
                code={emptyStateSnippets.illustration}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    gap: "32px",
                    p: "40px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <EmptyIllustration icon={Inbox} />
                  <EmptyIllustration icon={ShieldAlert} />
                  <EmptyIllustration icon={ListTodo} />
                </Box>
              </ExampleWithCode>
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              EmptyIllustration props
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "icon", value: "LucideIcon (required)" },
                { property: "scale", value: "1 (default)" },
              ]}
            />

            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", mt: "24px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              SVG dimensions
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Width", value: "180px" },
                { property: "Height", value: "120px" },
                { property: "Circle radius", value: "26px" },
                { property: "Icon size", value: "18px" },
                { property: "Line dash", value: "4 3" },
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
            "Use EmptyState for table cells when no data is available",
            "Pass a contextual icon prop (e.g. Database, ShieldAlert, ListTodo)",
            "Set showBorder={true} for standalone containers (not inside tables)",
            "Customize message prop for context-specific feedback",
            "EmptyState includes proper ARIA role='status' for accessibility",
            "Illustration adapts to light/dark theme automatically",
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

export default EmptyStatesSection;
