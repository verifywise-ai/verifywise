import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar } from "@mui/material";
import { Copy, Home, Settings } from "lucide-react";
import { Breadcrumbs } from "../../../components/breadcrumbs";
import CodeBlock from "../components/CodeBlock";

const breadcrumbSnippets = {
  manual: `<Breadcrumbs
  items={[
    { label: "Home", path: "/", icon: <Home size={14} /> },
    { label: "Settings", path: "/settings" },
    { label: "Profile", path: "/settings/profile" },
  ]}
/>`,
  autoGenerate: `<Breadcrumbs
  autoGenerate={true}
  homeLabel="Dashboard"
  homePath="/"
/>`,
  customSeparator: `<Breadcrumbs
  items={items}
  separator={<ChevronRight size={14} />}
/>`,
  truncated: `<Breadcrumbs
  items={items}
  truncateLabels={true}
  maxLabelLength={15}
/>`,
};

const BreadcrumbsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const sampleItems = [
    { label: "Home", path: "/", icon: <Home size={14} /> },
    { label: "Settings", path: "/settings", icon: <Settings size={14} /> },
    { label: "Profile", path: "/settings/profile" },
  ];

  const longItems = [
    { label: "Home", path: "/" },
    { label: "Document Management", path: "/documents" },
    { label: "Very Long Category Name Here", path: "/documents/category" },
    { label: "Current Page", path: "/documents/category/page" },
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
          Breadcrumbs
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Navigation breadcrumbs for showing page hierarchy. Supports manual items or
          auto-generation from routes.
        </Typography>
      </Box>

      {/* Manual Breadcrumbs */}
      <SpecSection title="Manual breadcrumbs">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Pass an items array to manually define the breadcrumb trail.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="With icons"
                code={breadcrumbSnippets.manual}
                onCopy={handleCopy}
              >
                <Breadcrumbs items={sampleItems} />
              </ExampleWithCode>

              <ExampleWithCode
                label="Without icons"
                code={breadcrumbSnippets.manual}
                onCopy={handleCopy}
              >
                <Breadcrumbs
                  items={[
                    { label: "Home", path: "/" },
                    { label: "Projects", path: "/projects" },
                    { label: "Project Alpha", path: "/projects/alpha" },
                  ]}
                />
              </ExampleWithCode>

              <ExampleWithCode
                label="Truncated labels"
                code={breadcrumbSnippets.truncated}
                onCopy={handleCopy}
              >
                <Breadcrumbs items={longItems} truncateLabels={true} maxLabelLength={15} />
              </ExampleWithCode>
            </Stack>
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
              Component specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Item font size", value: "13px" },
                { property: "Item font weight", value: "400 (500 for current)" },
                { property: "Item color", value: "text.secondary" },
                { property: "Item hover color", value: "primary.main" },
                { property: "Item padding", value: "3px 10px" },
                { property: "Item border radius", value: "4px" },
                { property: "Item background", value: "rgba(0,0,0,0.04)" },
                { property: "Separator size", value: "16px" },
                { property: "Separator margin", value: "8px left, 4.5px right" },
                { property: "Icon gap", value: "6px" },
                { property: "Max label length", value: "20 (default)" },
                { property: "Transition", value: "0.2s ease" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Auto-generate */}
      <SpecSection title="Auto-generated breadcrumbs">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Set autoGenerate=true to automatically create breadcrumbs from the current URL path. Uses
          routeMapping.ts for label conversion.
        </Typography>

        <ExampleWithCode
          label="Auto-generate from route"
          code={breadcrumbSnippets.autoGenerate}
          onCopy={handleCopy}
        >
          <Box
            sx={{ p: "8px", backgroundColor: theme.palette.background.fill, borderRadius: "4px" }}
          >
            <Typography sx={{ fontSize: 12, color: theme.palette.text.accent, mb: "8px" }}>
              Example for path: /settings/profile
            </Typography>
            <Breadcrumbs
              items={[
                { label: "Dashboard", path: "/" },
                { label: "Settings", path: "/settings" },
                { label: "Profile", path: "/settings/profile" },
              ]}
            />
          </Box>
        </ExampleWithCode>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Props Reference */}
      <SpecSection title="Props reference">
        <Box
          sx={{
            backgroundColor: theme.palette.background.alt,
            borderRadius: "4px",
            border: `1px solid ${theme.palette.border.light}`,
            overflow: "hidden",
          }}
        >
          {[
            {
              prop: "items",
              type: "IBreadcrumbItem[]",
              default: "[]",
              desc: "Manual breadcrumb items",
            },
            {
              prop: "autoGenerate",
              type: "boolean",
              default: "false",
              desc: "Auto-generate from URL",
            },
            { prop: "homeLabel", type: "string", default: '"Home"', desc: "Label for home item" },
            { prop: "homePath", type: "string", default: '"/"', desc: "Path for home item" },
            {
              prop: "separator",
              type: "ReactNode",
              default: "<ChevronRight />",
              desc: "Custom separator",
            },
            { prop: "maxItems", type: "number", default: "8", desc: "Max items before collapse" },
            {
              prop: "truncateLabels",
              type: "boolean",
              default: "true",
              desc: "Truncate long labels",
            },
            {
              prop: "maxLabelLength",
              type: "number",
              default: "20",
              desc: "Max chars before truncate",
            },
            {
              prop: "showCurrentPage",
              type: "boolean",
              default: "true",
              desc: "Show current page in trail",
            },
            {
              prop: "onItemClick",
              type: "function",
              default: "undefined",
              desc: "Custom click handler",
            },
          ].map((item, index, arr) => (
            <Box
              key={item.prop}
              sx={{
                display: "grid",
                gridTemplateColumns: "140px 120px 100px 1fr",
                gap: "12px",
                p: "10px 14px",
                borderBottom:
                  index < arr.length - 1 ? `1px solid ${theme.palette.border.light}` : "none",
                alignItems: "center",
              }}
            >
              <Typography
                sx={{ fontSize: 12, fontFamily: "monospace", color: theme.palette.primary.main }}
              >
                {item.prop}
              </Typography>
              <Typography
                sx={{ fontSize: 11, fontFamily: "monospace", color: theme.palette.text.tertiary }}
              >
                {item.type}
              </Typography>
              <Typography
                sx={{ fontSize: 11, fontFamily: "monospace", color: theme.palette.text.accent }}
              >
                {item.default}
              </Typography>
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                {item.desc}
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
            "Use Breadcrumbs component from components/breadcrumbs",
            "Provide icon for home/root items for better visual hierarchy",
            "Last item is automatically non-clickable (current page)",
            "Use autoGenerate for consistent breadcrumbs across the app",
            "Route labels are configured in routeMapping.ts",
            "Truncation happens automatically for labels > maxLabelLength",
            "Hovering truncated labels shows full text in tooltip",
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

      <Box sx={{ p: "16px", backgroundColor: theme.palette.background.main }}>{children}</Box>

      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default BreadcrumbsSection;
