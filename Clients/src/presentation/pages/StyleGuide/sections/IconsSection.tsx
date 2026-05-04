import React, { useState, useMemo } from "react";
import {
  Box,
  Stack,
  Typography,
  useTheme,
  Snackbar,
  TextField,
  InputAdornment,
} from "@mui/material";
import { Copy, Search } from "lucide-react";
import * as LucideIcons from "lucide-react";
import CodeBlock from "../components/CodeBlock";
import { status } from "../../../themes/palette";

// Common icons used throughout VerifyWise
const COMMON_ICONS = [
  // Navigation & UI
  "ChevronDown",
  "ChevronUp",
  "ChevronLeft",
  "ChevronRight",
  "ChevronsLeft",
  "ChevronsRight",
  "ArrowLeft",
  "ArrowRight",
  "X",
  "Check",
  "Plus",
  "Minus",
  "MoreHorizontal",
  "MoreVertical",
  "Menu",
  "Search",
  "Filter",
  "Settings",
  "Home",
  // Actions
  "Edit",
  "Trash2",
  "Copy",
  "Download",
  "Upload",
  "Save",
  "Share",
  "Link",
  "ExternalLink",
  "Eye",
  "EyeOff",
  "Lock",
  "Unlock",
  "RefreshCw",
  "RotateCcw",
  // Status & Feedback
  "AlertCircle",
  "AlertTriangle",
  "CheckCircle",
  "XCircle",
  "Info",
  "HelpCircle",
  "Bell",
  "BellOff",
  // Content
  "File",
  "FileText",
  "Folder",
  "FolderOpen",
  "Image",
  "Calendar",
  "Clock",
  "Mail",
  "MessageSquare",
  "MessageCircle",
  // Users & People
  "User",
  "Users",
  "UserPlus",
  "UserMinus",
  "UserCircle",
  // Data & Charts
  "BarChart",
  "PieChart",
  "TrendingUp",
  "TrendingDown",
  "Activity",
  // Objects
  "Box",
  "Package",
  "Shield",
  "ShieldCheck",
  "Flag",
  "Tag",
  "Bookmark",
  "Star",
  "Heart",
  "ThumbsUp",
  // Layout
  "Layout",
  "LayoutGrid",
  "LayoutList",
  "Layers",
  "Grid",
  "Table",
  "Table2",
  "Columns",
  "Rows",
  // Misc
  "Loader",
  "Loader2",
  "Zap",
  "Target",
  "Crosshair",
  "Globe",
  "MapPin",
  "Navigation",
  "Compass",
];

const iconSnippets = {
  basic: `import { User, Settings, Bell } from "lucide-react";

<User size={16} />
<Settings size={20} />
<Bell size={24} />`,
  withColor: `// Using theme colors
<User
  size={16}
  color={theme.palette.text.secondary}
/>

// Using hex colors
<AlertCircle
  size={16}
  color="#D32F2F"  // Error red
/>`,
  withStroke: `// Adjust stroke width (default: 2)
<User size={16} strokeWidth={1.5} />  // Thinner
<User size={16} strokeWidth={2} />    // Default
<User size={16} strokeWidth={2.5} />  // Bolder`,
  inButton: `import { Plus } from "lucide-react";
import { Button } from "@mui/material";

<Button startIcon={<Plus size={16} />}>
  Add item
</Button>`,
  tabBarIcon: `// TabBar accepts icon name as string
<TabBar
  tabs={[
    { label: "Profile", value: "profile", icon: "User" },
    { label: "Settings", value: "settings", icon: "Settings" },
  ]}
  activeTab={activeTab}
  onChange={handleChange}
/>`,
};

const IconsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const filteredIcons = useMemo(() => {
    if (!searchQuery.trim()) return COMMON_ICONS;
    const query = searchQuery.toLowerCase();
    return COMMON_ICONS.filter((name) => name.toLowerCase().includes(query));
  }, [searchQuery]);

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
          Icons
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          VerifyWise uses lucide-react for all icons. This catalog shows commonly used icons with
          their import names. Click any icon to copy its import.
        </Typography>
      </Box>

      {/* Icon Catalog */}
      <SpecSection title="Icon catalog">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "16px" }}>
          Click an icon to copy its import statement. All icons are from lucide-react.
        </Typography>

        {/* Search */}
        <TextField
          placeholder="Search icons..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{
            mb: "24px",
            width: 300,
            "& .MuiOutlinedInput-root": {
              borderRadius: "4px",
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} color={theme.palette.text.tertiary} />
              </InputAdornment>
            ),
          }}
        />

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
            gap: "8px",
            p: "16px",
            backgroundColor: theme.palette.background.fill,
            borderRadius: "4px",
            border: `1px solid ${theme.palette.border.light}`,
          }}
        >
          {filteredIcons.map((iconName) => {
            const IconComponent = (
              LucideIcons as unknown as Record<string, React.FC<{ size?: number; color?: string }>>
            )[iconName];
            if (!IconComponent) return null;
            return (
              <Box
                key={iconName}
                onClick={() => handleCopy(`import { ${iconName} } from "lucide-react";`)}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "6px",
                  p: "12px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  backgroundColor: theme.palette.background.main,
                  border: `1px solid ${theme.palette.border.light}`,
                  transition: "all 150ms ease",
                  "&:hover": {
                    borderColor: theme.palette.primary.main,
                    backgroundColor: theme.palette.background.accent,
                  },
                }}
              >
                <IconComponent size={20} color={theme.palette.text.secondary} />
                <Typography
                  sx={{
                    fontSize: 9,
                    color: theme.palette.text.tertiary,
                    textAlign: "center",
                    wordBreak: "break-all",
                  }}
                >
                  {iconName}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {filteredIcons.length === 0 && (
          <Typography
            sx={{
              fontSize: 13,
              color: theme.palette.text.tertiary,
              textAlign: "center",
              py: "40px",
            }}
          >
            No icons found matching "{searchQuery}"
          </Typography>
        )}
      </SpecSection>

      {/* Usage Examples */}
      <SpecSection title="Usage examples">
        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode label="Basic usage" code={iconSnippets.basic} onCopy={handleCopy}>
                <Box
                  sx={{
                    display: "flex",
                    gap: "24px",
                    alignItems: "center",
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.User size={16} color={theme.palette.text.secondary} />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      16px
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.Settings size={20} color={theme.palette.text.secondary} />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      20px
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.Bell size={24} color={theme.palette.text.secondary} />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      24px
                    </Typography>
                  </Box>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="With colors"
                code={iconSnippets.withColor}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    display: "flex",
                    gap: "24px",
                    alignItems: "center",
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.CheckCircle size={20} color={status.success.text} />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      Success
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.AlertCircle size={20} color={status.error.text} />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      Error
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.AlertTriangle size={20} color="#795548" />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      Warning
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.Info size={20} color="#1565C0" />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      Info
                    </Typography>
                  </Box>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="Stroke width"
                code={iconSnippets.withStroke}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    display: "flex",
                    gap: "32px",
                    alignItems: "center",
                    p: "24px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.User
                      size={24}
                      strokeWidth={1.5}
                      color={theme.palette.text.secondary}
                    />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      1.5
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.User
                      size={24}
                      strokeWidth={2}
                      color={theme.palette.text.secondary}
                    />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      2 (default)
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "center" }}>
                    <LucideIcons.User
                      size={24}
                      strokeWidth={2.5}
                      color={theme.palette.text.secondary}
                    />
                    <Typography
                      sx={{ fontSize: 10, color: theme.palette.text.tertiary, mt: "4px" }}
                    >
                      2.5
                    </Typography>
                  </Box>
                </Box>
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
              Size reference
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "12px", value: "Inline text, badges" },
                { property: "14px", value: "Tab icons, small buttons" },
                { property: "16px", value: "Buttons, inputs (default)" },
                { property: "18px", value: "Nav items, section icons" },
                { property: "20px", value: "Cards, medium emphasis" },
                { property: "24px", value: "Headers, large emphasis" },
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
              Color tokens
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Default", value: "text.icon (text.tertiary)" },
                { property: "Primary", value: "brand.primary (primary.main)" },
                { property: "Success", value: "status.success.text (status.success.main)" },
                { property: "Error", value: "status.error.text (status.error.main)" },
                { property: "Warning", value: "#795548 (status.warning.main)" },
                { property: "Info", value: "#1565C0 (status.info.main)" },
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
              Common props
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "size", value: "number (pixels)" },
                { property: "color", value: "string (hex or theme)" },
                { property: "strokeWidth", value: "number (default: 2)" },
                { property: "absoluteStrokeWidth", value: "boolean" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* TabBar Integration */}
      <SpecSection title="TabBar integration">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          The TabBar component accepts icon names as strings and renders them automatically.
        </Typography>

        <ExampleWithCode label="Icon in TabBar" code={iconSnippets.tabBarIcon} onCopy={handleCopy}>
          <Box
            sx={{
              p: "16px",
              backgroundColor: theme.palette.background.fill,
              borderRadius: "4px",
            }}
          >
            <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
              Pass icon name as string: <code>icon: "User"</code> → renders{" "}
              <LucideIcons.User size={14} style={{ verticalAlign: "middle" }} />
            </Typography>
          </Box>
        </ExampleWithCode>
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
            'Always import icons individually: import { User } from "lucide-react"',
            "Use 16px for buttons, 18px for navigation, 20-24px for headers",
            "Default strokeWidth is 2 - use 1.5 for lighter icons",
            "Use theme.palette colors for consistency",
            "TabBar accepts icon names as strings, not components",
            "Check lucide.dev for the full icon library",
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

export default IconsSection;
