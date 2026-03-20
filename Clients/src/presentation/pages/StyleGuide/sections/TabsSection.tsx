import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { Copy, Users } from "lucide-react";
import TabBar, { TabItem } from "../../../components/TabBar";
import CodeBlock from "../components/CodeBlock";

const tabSnippets = {
  basic: `import TabBar from "../components/TabBar";
import TabContext from "@mui/lab/TabContext";

const [activeTab, setActiveTab] = useState("profile");

<TabContext value={activeTab}>
  <TabBar
    tabs={[
      { label: "Profile", value: "profile" },
      { label: "Settings", value: "settings" },
      { label: "Notifications", value: "notifications" },
    ]}
    activeTab={activeTab}
    onChange={(_, newValue) => setActiveTab(newValue)}
  />
</TabContext>`,
  withIcons: `<TabBar
  tabs={[
    { label: "Profile", value: "profile", icon: "User" },
    { label: "Team", value: "team", icon: "Users" },
    { label: "Settings", value: "settings", icon: "Settings" },
  ]}
  activeTab={activeTab}
  onChange={(_, newValue) => setActiveTab(newValue)}
/>`,
  withCounts: `<TabBar
  tabs={[
    { label: "Documents", value: "documents", count: 12 },
    { label: "Pending", value: "pending", count: 3 },
    { label: "Archived", value: "archived", count: 0 },
  ]}
  activeTab={activeTab}
  onChange={(_, newValue) => setActiveTab(newValue)}
/>`,
  withLoading: `<TabBar
  tabs={[
    { label: "All items", value: "all", count: items.length, isLoading: isLoading },
    { label: "Active", value: "active", count: activeCount, isLoading: isLoading },
  ]}
  activeTab={activeTab}
  onChange={(_, newValue) => setActiveTab(newValue)}
/>`,
  customIndicator: `<TabBar
  tabs={tabs}
  activeTab={activeTab}
  onChange={(_, newValue) => setActiveTab(newValue)}
  indicatorColor="#E74C3C" // Custom red indicator
/>`,
  tabItem: `interface TabItem {
  label: string;          // Tab text
  value: string;          // Unique identifier
  icon?: keyof typeof LucideIcons;  // Icon name from lucide-react
  count?: number;         // Badge count
  isLoading?: boolean;    // Hide badge during loading
  disabled?: boolean;     // Disable tab interaction
}`,
  tabLabelUtil: `import { createTabLabelWithCount } from "../utils/tabUtils";

// Create tab label with count badge
createTabLabelWithCount({
  label: "Vendors",
  count: 10,
  icon: <Users size={14} />,
  isLoading: false,
  showZero: true,
});`,
};

const TabsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Demo state for interactive examples
  const [basicTab, setBasicTab] = useState("profile");
  const [iconTab, setIconTab] = useState("profile");
  const [countTab, setCountTab] = useState("documents");

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const basicTabs: TabItem[] = [
    { label: "Profile", value: "profile" },
    { label: "Settings", value: "settings" },
    { label: "Notifications", value: "notifications" },
  ];

  const iconTabs: TabItem[] = [
    { label: "Profile", value: "profile", icon: "User" },
    { label: "Team", value: "team", icon: "Users" },
    { label: "Settings", value: "settings", icon: "Settings" },
  ];

  const countTabs: TabItem[] = [
    { label: "Documents", value: "documents", count: 12 },
    { label: "Pending", value: "pending", count: 3 },
    { label: "Archived", value: "archived", count: 0 },
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
          Tabs
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Standardized TabBar component for consistent tabbed navigation.
          Supports icons, count badges, loading states, and disabled tabs.
        </Typography>
      </Box>

      {/* Basic Tabs */}
      <SpecSection title="Basic tabs">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          The TabBar component wraps MUI TabList with VerifyWise styling.
          Requires TabContext as a parent for proper functionality.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Simple tabs"
                code={tabSnippets.basic}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    backgroundColor: theme.palette.background.main,
                    borderRadius: "4px",
                  }}
                >
                  <TabContext value={basicTab}>
                    <TabBar
                      tabs={basicTabs}
                      activeTab={basicTab}
                      onChange={(_, newValue) => setBasicTab(newValue)}
                    />
                  </TabContext>
                  <Box sx={{ p: "24px" }}>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      Active tab: <strong>{basicTab}</strong>
                    </Typography>
                  </Box>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="Tabs with icons"
                code={tabSnippets.withIcons}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    backgroundColor: theme.palette.background.main,
                    borderRadius: "4px",
                  }}
                >
                  <TabContext value={iconTab}>
                    <TabBar
                      tabs={iconTabs}
                      activeTab={iconTab}
                      onChange={(_, newValue) => setIconTab(newValue)}
                    />
                  </TabContext>
                  <Box sx={{ p: "24px" }}>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      Icons are from lucide-react. Pass icon name as string.
                    </Typography>
                  </Box>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="Tabs with count badges"
                code={tabSnippets.withCounts}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    backgroundColor: theme.palette.background.main,
                    borderRadius: "4px",
                  }}
                >
                  <TabContext value={countTab}>
                    <TabBar
                      tabs={countTabs}
                      activeTab={countTab}
                      onChange={(_, newValue) => setCountTab(newValue)}
                    />
                  </TabContext>
                  <Box sx={{ p: "24px" }}>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      Badges show 99+ for counts over 99. Zero is displayed by default.
                    </Typography>
                  </Box>
                </Box>
              </ExampleWithCode>
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              TabBar props
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "tabs", value: "TabItem[] (required)" },
                { property: "activeTab", value: "string (required)" },
                { property: "onChange", value: "(event, value) => void" },
                { property: "indicatorColor", value: "brand.primary (default)" },
                { property: "disableRipple", value: "true (default)" },
                { property: "tabListSx", value: "SxProps for container" },
                { property: "tabSx", value: "SxProps for tabs" },
                { property: "dataJoyrideId", value: "String for tours" },
              ]}
            />

            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", mt: "24px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Styling specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Border bottom", value: "1px solid #d0d5dd" },
                { property: "Tab gap", value: "34px" },
                { property: "Tab padding", value: "16px 0 7px" },
                { property: "Min height", value: "20px" },
                { property: "Text transform", value: "none" },
                { property: "Font weight", value: "400 (500 when selected)" },
                { property: "Selected color", value: "brand.primary" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* TabItem Interface */}
      <SpecSection title="TabItem interface">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Each tab is defined using the TabItem interface. All properties except label and value are optional.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="TabItem type definition"
              code={tabSnippets.tabItem}
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
                  <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: "#E74C3C",
                      }}
                    />
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.primary }}>
                      <strong>label</strong> - Required. Display text for the tab
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: "#E74C3C",
                      }}
                    />
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.primary }}>
                      <strong>value</strong> - Required. Unique identifier string
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: theme.palette.grey[400],
                      }}
                    />
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      <strong>icon</strong> - Optional. Lucide icon name (e.g., "User")
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: theme.palette.grey[400],
                      }}
                    />
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      <strong>count</strong> - Optional. Number displayed in badge
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: theme.palette.grey[400],
                      }}
                    />
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      <strong>isLoading</strong> - Optional. Hides badge when true
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: theme.palette.grey[400],
                      }}
                    />
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      <strong>disabled</strong> - Optional. Disables tab interaction
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </ExampleWithCode>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Icon specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Icon size", value: "14px" },
                { property: "Stroke width", value: "1.5" },
                { property: "Opacity", value: "1" },
                { property: "Icon library", value: "lucide-react" },
              ]}
            />

            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", mt: "24px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Badge specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Min width", value: "22px" },
                { property: "Height", value: "22px" },
                { property: "Font size", value: "10px" },
                { property: "Font weight", value: "600" },
                { property: "Color", value: "#047857" },
                { property: "Background", value: "#D1FAE5" },
                { property: "Border radius", value: "11px" },
                { property: "Max display", value: "99 (shows 99+)" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      {/* Tab Label Utility */}
      <SpecSection title="createTabLabelWithCount utility">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          For advanced use cases or when building custom tab components, use the createTabLabelWithCount
          utility function from tabUtils.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <ExampleWithCode
              label="Using the utility function"
              code={tabSnippets.tabLabelUtil}
              onCopy={handleCopy}
            >
              <Box
                sx={{
                  p: "24px",
                  backgroundColor: theme.palette.background.fill,
                  borderRadius: "4px",
                }}
              >
                <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary, mb: "16px" }}>
                  The utility returns a ReactNode that can be passed directly to MUI Tab's label prop.
                  TabBar uses this internally.
                </Typography>

                <Box sx={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                  {/* Preview of label with icon and count */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Users size={14} opacity={0.7} />
                    <Typography sx={{ fontSize: 14 }}>Vendors</Typography>
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: "22px",
                        height: "22px",
                        padding: "0 6px",
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#047857",
                        backgroundColor: "#D1FAE5",
                        borderRadius: "11px",
                      }}
                    >
                      10
                    </Box>
                  </Box>
                </Box>
              </Box>
            </ExampleWithCode>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Utility options
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "label", value: "string (required)" },
                { property: "count", value: "number (optional)" },
                { property: "showZero", value: "true (default)" },
                { property: "isLoading", value: "false (default)" },
                { property: "icon", value: "ReactNode (optional)" },
                { property: "chipSx", value: "SxProps (optional)" },
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
            "Always wrap TabBar with TabContext provider",
            "Use TabBar instead of raw MUI Tabs for consistent styling",
            "Pass icon names as strings (e.g., icon: \"User\"), not components",
            "Set isLoading: true on tabs when fetching count data",
            "Use disabled: true for tabs that shouldn't be accessible yet",
            "Indicator color defaults to brand.primary - override with indicatorColor prop",
            "Tab values must be unique strings within the same TabBar",
            "Development mode warns if activeTab doesn't match any tab value",
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

export default TabsSection;
