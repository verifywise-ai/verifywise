import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy } from "lucide-react";
import { TagChip } from "../../../components/Tags";
import CodeBlock from "../components/CodeBlock";

const tagSnippets = {
  basic: `import { TagChip } from "../Tags";

<TagChip tag="AI Ethics" />`,
  multiple: `<Stack direction="row" spacing={1} flexWrap="wrap">
  {tags.map((tag) => (
    <TagChip key={tag} tag={tag} />
  ))}
</Stack>`,
};

// All official tags from the component
const officialTags = [
  // Ethics & Fairness
  { tag: "AI Ethics", category: "Ethics & Fairness" },
  { tag: "Fairness", category: "Ethics & Fairness" },
  { tag: "Bias Mitigation", category: "Ethics & Fairness" },
  // Transparency
  { tag: "Transparency", category: "Transparency & Explainability" },
  { tag: "Explainability", category: "Transparency & Explainability" },
  // Privacy
  { tag: "Privacy", category: "Privacy & Data Governance" },
  { tag: "Data Governance", category: "Privacy & Data Governance" },
  // Risk & Security
  { tag: "Model Risk", category: "Risk & Security" },
  { tag: "Security", category: "Risk & Security" },
  // Accountability
  { tag: "Accountability", category: "Accountability & Oversight" },
  { tag: "Human Oversight", category: "Accountability & Oversight" },
  // Compliance
  { tag: "EU AI Act", category: "Compliance & Standards" },
  { tag: "ISO 42001", category: "Compliance & Standards" },
  { tag: "NIST RMF", category: "Compliance & Standards" },
  // LLM
  { tag: "LLM", category: "LLM Specific" },
];

const TagsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Group tags by category
  const tagsByCategory = officialTags.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item.tag);
    return acc;
  }, {} as Record<string, string[]>);

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
          Tags & chips
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          TagChip component for displaying categorized labels. Each official tag has a predefined color scheme.
        </Typography>
      </Box>

      {/* All Tags Preview */}
      <SpecSection title="Official policy tags">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Predefined tags with semantic color coding based on category.
        </Typography>

        <Stack spacing="24px">
          {Object.entries(tagsByCategory).map(([category, tags]) => (
            <Box key={category}>
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
                {category}
              </Typography>
              <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {tags.map((tag) => (
                  <TagChip key={tag} tag={tag} />
                ))}
              </Box>
            </Box>
          ))}
        </Stack>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Usage */}
      <SpecSection title="Usage">
        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Single tag"
                code={tagSnippets.basic}
                onCopy={handleCopy}
              >
                <TagChip tag="AI Ethics" />
              </ExampleWithCode>

              <ExampleWithCode
                label="Multiple tags"
                code={tagSnippets.multiple}
                onCopy={handleCopy}
              >
                <Box sx={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <TagChip tag="Privacy" />
                  <TagChip tag="Security" />
                  <TagChip tag="EU AI Act" />
                  <TagChip tag="LLM" />
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="Unknown tag (default style)"
                code={`<TagChip tag="Custom Tag" />`}
                onCopy={handleCopy}
              >
                <Box sx={{ display: "flex", gap: "8px" }}>
                  <TagChip tag="Custom Tag" />
                  <TagChip tag="Unknown" />
                </Box>
              </ExampleWithCode>
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Component specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Padding", value: "4px 8px" },
                { property: "Border radius", value: "4px" },
                { property: "Font size", value: "11px" },
                { property: "Font weight", value: "500" },
                { property: "Text transform", value: "uppercase" },
                { property: "White space", value: "nowrap" },
                { property: "Display", value: "inline-block" },
                { property: "Default bg", value: "background.surface" },
                { property: "Default color", value: "#616161" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Color Reference */}
      <SpecSection title="Tag color reference">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Color schemes defined in TagChip.tsx getTagStyle function.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {[
            { tag: "AI Ethics", bg: "#E6F4EA", color: "status.success.text" },
            { tag: "Fairness", bg: "#E8F5E9", color: "#2E7D32" },
            { tag: "Bias Mitigation", bg: "#F1F8E9", color: "#558B2F" },
            { tag: "Transparency", bg: "#E3F2FD", color: "#1565C0" },
            { tag: "Explainability", bg: "#E1F5FE", color: "#0277BD" },
            { tag: "Privacy", bg: "#F3E5F5", color: "#6A1B9A" },
            { tag: "Data Governance", bg: "#EDE7F6", color: "#4527A0" },
            { tag: "Model Risk", bg: "#FFE5D0", color: "#E64A19" },
            { tag: "Security", bg: "#FFECB3", color: "#F57F17" },
            { tag: "Accountability", bg: "#EDE7F6", color: "#5E35B1" },
            { tag: "Human Oversight", bg: "#E8EAF6", color: "#3949AB" },
            { tag: "EU AI Act", bg: "#FFF8E1", color: "#F57C00" },
            { tag: "ISO 42001", bg: "#FFF3E0", color: "#EF6C00" },
            { tag: "NIST RMF", bg: "#FFECB3", color: "#F9A825" },
            { tag: "LLM", bg: "#E0F7FA", color: "#00838F" },
            { tag: "Default", bg: "background.surface", color: "#616161" },
          ].map((item) => (
            <Box
              key={item.tag}
              onClick={() => handleCopy(`bg: "${item.bg}", color: "${item.color}"`)}
              sx={{
                p: "10px 12px",
                backgroundColor: theme.palette.background.alt,
                borderRadius: "4px",
                border: `1px solid ${theme.palette.border.light}`,
                cursor: "pointer",
                "&:hover": {
                  borderColor: theme.palette.primary.main,
                },
              }}
            >
              <Box
                sx={{
                  display: "inline-block",
                  backgroundColor: item.bg,
                  color: item.color,
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontWeight: 500,
                  fontSize: 11,
                  textTransform: "uppercase",
                  mb: "8px",
                }}
              >
                {item.tag}
              </Box>
              <Box sx={{ display: "flex", gap: "8px" }}>
                <Typography sx={{ fontSize: 10, fontFamily: "monospace", color: theme.palette.text.accent }}>
                  bg: {item.bg}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 10, fontFamily: "monospace", color: theme.palette.text.accent }}>
                color: {item.color}
              </Typography>
            </Box>
          ))}
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
            "Import TagChip from components/Tags",
            "Tags are case-insensitive (matched via toLowerCase())",
            "Unknown tags use default gray style (background.surface bg, #616161 text)",
            "Tags are displayed in uppercase automatically",
            "Use flex wrap when displaying multiple tags",
            "Gap of 8px between tags is recommended",
            "Official tags are defined in POLICY_TAGS on backend",
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

export default TagsSection;
