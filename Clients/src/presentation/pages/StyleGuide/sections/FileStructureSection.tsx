import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Snackbar } from "@mui/material";
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown } from "lucide-react";

const FileStructureSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(["src", "presentation", "components", "pages", "application", "themes"]),
  );

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const fileStructure = {
    name: "src",
    type: "folder",
    description: "Source code root",
    children: [
      {
        name: "application",
        type: "folder",
        description: "App configuration",
        children: [
          {
            name: "config",
            type: "folder",
            description: "Routes, constants",
            children: [{ name: "routes.tsx", type: "file", description: "Route definitions" }],
          },
          {
            name: "hooks",
            type: "folder",
            description: "Custom React hooks",
            children: [
              { name: "useLocalStorage.ts", type: "file", description: "localStorage wrapper" },
            ],
          },
          { name: "redux", type: "folder", description: "Redux store & slices" },
          { name: "validations", type: "folder", description: "Form validation schemas" },
        ],
      },
      {
        name: "domain",
        type: "folder",
        description: "Business logic",
        children: [{ name: "entities", type: "folder", description: "TypeScript interfaces" }],
      },
      {
        name: "infrastructure",
        type: "folder",
        description: "External services",
        children: [{ name: "api", type: "folder", description: "API client & endpoints" }],
      },
      {
        name: "presentation",
        type: "folder",
        description: "UI layer (React components)",
        children: [
          {
            name: "components",
            type: "folder",
            description: "Reusable UI components",
            children: [
              { name: "Alert", type: "folder", description: "Toast notifications" },
              { name: "Avatar", type: "folder", description: "User avatars" },
              { name: "breadcrumbs", type: "folder", description: "Navigation breadcrumbs" },
              { name: "button", type: "folder", description: "Button variants" },
              { name: "Cards", type: "folder", description: "Card components" },
              { name: "Drawer", type: "folder", description: "Side drawers" },
              { name: "EmptyState", type: "folder", description: "No data states" },
              { name: "Inputs", type: "folder", description: "Form inputs (Select, Field, etc.)" },
              { name: "Modals", type: "folder", description: "Dialog modals" },
              { name: "Table", type: "folder", description: "Data tables" },
              { name: "TabBar", type: "folder", description: "Tab navigation" },
              { name: "Tags", type: "folder", description: "Tag chips" },
              { name: "Toast", type: "folder", description: "Full-page loading toast" },
              { name: "Tooltip", type: "folder", description: "Enhanced tooltips" },
            ],
          },
          {
            name: "pages",
            type: "folder",
            description: "Page components",
            children: [
              { name: "Authentication", type: "folder", description: "Login, Register, etc." },
              { name: "Dashboard", type: "folder", description: "Main dashboard" },
              { name: "Projects", type: "folder", description: "Project management" },
              { name: "Settings", type: "folder", description: "App settings" },
              { name: "StyleGuide", type: "folder", description: "This style guide (dev only)" },
            ],
          },
          {
            name: "themes",
            type: "folder",
            description: "Theme configuration",
            children: [
              { name: "light.ts", type: "file", description: "Light theme (main)" },
              { name: "mixins.ts", type: "file", description: "Reusable style mixins" },
              { name: "components.ts", type: "file", description: "Component style presets" },
              { name: "theme.d.ts", type: "file", description: "Theme type definitions" },
            ],
          },
          {
            name: "utils",
            type: "folder",
            description: "Utility functions",
            children: [{ name: "tabUtils.tsx", type: "file", description: "Tab label helpers" }],
          },
        ],
      },
    ],
  };

  const componentLocations = [
    { component: "Select dropdown", path: "components/Inputs/Select" },
    { component: "Text field", path: "components/Inputs/Field" },
    { component: "Search box", path: "components/Inputs/SearchBox" },
    { component: "Primary button", path: "components/button" },
    { component: "Data table", path: "components/Table" },
    { component: "Standard modal", path: "components/Modals/StandardModal" },
    { component: "Side drawer", path: "components/Drawer" },
    { component: "Tab bar", path: "components/TabBar" },
    { component: "Toast alert", path: "components/Alert" },
    { component: "Empty state", path: "components/EmptyState" },
    { component: "Breadcrumbs", path: "components/breadcrumbs" },
    { component: "Tag chip", path: "components/Tags/TagChip" },
  ];

  const conventions = [
    { rule: "Component folders", example: "ComponentName/index.tsx" },
    { rule: "Page folders", example: "PageName/index.tsx" },
    { rule: "Styles in component", example: "ComponentName/style.ts (if needed)" },
    { rule: "Types in component", example: "ComponentName/types.ts (if complex)" },
    { rule: "One component per file", example: "Don't export multiple components" },
    { rule: "Index re-exports", example: "export default from './Component'" },
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
          File structure
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Reference guide for the VerifyWise codebase structure. Know where to find components and
          where to add new ones.
        </Typography>
      </Box>

      {/* Directory Tree */}
      <SpecSection title="Directory structure">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Click folders to expand/collapse. Click file paths to copy.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Box
              sx={{
                p: "16px",
                backgroundColor: theme.palette.background.alt,
                border: `1px solid ${theme.palette.border.light}`,
                borderRadius: "4px",
                fontFamily: "'Fira Code', 'Consolas', monospace",
                fontSize: 12,
              }}
            >
              <TreeNode
                node={fileStructure}
                path="src"
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onCopy={handleCopy}
                level={0}
              />
            </Box>
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
              Layer responsibilities
            </Typography>
            <Stack spacing="12px">
              <LayerCard
                name="application"
                description="App-level configuration, hooks, state management, validation schemas"
                color={theme.palette.primary.main}
              />
              <LayerCard
                name="domain"
                description="Business logic, TypeScript interfaces, entities"
                color={theme.palette.status.warning.text || "#f59e0b"}
              />
              <LayerCard
                name="infrastructure"
                description="External services, API clients, third-party integrations"
                color={theme.palette.status.error.text || "#ef4444"}
              />
              <LayerCard
                name="presentation"
                description="UI components, pages, themes, utilities"
                color={theme.palette.status.success.text || "#22c55e"}
              />
            </Stack>
          </Box>
        </Box>
      </SpecSection>

      {/* Component Locations */}
      <SpecSection title="Component locations">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Quick reference for finding common components. All paths relative to
          <code
            style={{
              marginLeft: 4,
              padding: "2px 6px",
              backgroundColor: theme.palette.background.fill,
              borderRadius: 4,
            }}
          >
            src/presentation/
          </code>
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gap: "8px",
          }}
        >
          {componentLocations.map((item) => (
            <Box
              key={item.component}
              onClick={() => handleCopy(`src/presentation/${item.path}`)}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                p: "10px 14px",
                backgroundColor: theme.palette.background.alt,
                border: `1px solid ${theme.palette.border.light}`,
                borderRadius: "4px",
                cursor: "pointer",
                "&:hover": {
                  backgroundColor: theme.palette.background.fill,
                  borderColor: theme.palette.primary.main,
                },
              }}
            >
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                {item.component}
              </Typography>
              <Typography
                sx={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: theme.palette.text.tertiary,
                }}
              >
                {item.path}
              </Typography>
            </Box>
          ))}
        </Box>
      </SpecSection>

      {/* Naming Conventions */}
      <SpecSection title="Naming conventions">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Follow these conventions when adding new files and components.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 400px", minWidth: 300 }}>
            <Box
              sx={{
                backgroundColor: theme.palette.background.alt,
                borderRadius: "4px",
                border: `1px solid ${theme.palette.border.light}`,
                overflow: "hidden",
              }}
            >
              {conventions.map((item, index) => (
                <Box
                  key={index}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    p: "12px 16px",
                    borderBottom:
                      index < conventions.length - 1
                        ? `1px solid ${theme.palette.border.light}`
                        : "none",
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: theme.palette.text.primary }}>
                    {item.rule}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: theme.palette.text.tertiary,
                      backgroundColor: theme.palette.background.fill,
                      px: "8px",
                      py: "2px",
                      borderRadius: "4px",
                    }}
                  >
                    {item.example}
                  </Typography>
                </Box>
              ))}
            </Box>
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
              File naming
            </Typography>
            <Stack spacing="8px">
              {[
                { pattern: "PascalCase", usage: "Components, Pages" },
                { pattern: "camelCase", usage: "Hooks, utilities, functions" },
                { pattern: "kebab-case", usage: "CSS files (rare)" },
                { pattern: "UPPER_CASE", usage: "Constants" },
                { pattern: "index.tsx", usage: "Main component export" },
                { pattern: "style.ts", usage: "Styled components (if needed)" },
              ].map((item) => (
                <Box
                  key={item.pattern}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    p: "8px 12px",
                    backgroundColor: theme.palette.background.alt,
                    borderRadius: "4px",
                    border: `1px solid ${theme.palette.border.light}`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: theme.palette.primary.main,
                    }}
                  >
                    {item.pattern}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
                    {item.usage}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      </SpecSection>

      {/* Quick Tips */}
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
          Quick tips
        </Typography>
        <Stack spacing="8px">
          {[
            "New reusable component → presentation/components/ComponentName/index.tsx",
            "New page → presentation/pages/PageName/index.tsx + add route in routes.tsx",
            "New hook → application/hooks/useHookName.ts",
            "New API endpoint → infrastructure/api/",
            "Theme changes → presentation/themes/light.ts",
            "Style mixins → presentation/themes/mixins.ts",
            "Type definitions → domain/entities/ or component's types.ts",
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
              <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
};

// Tree Node Component
interface TreeNodeProps {
  node: {
    name: string;
    type: string;
    description?: string;
    children?: TreeNodeProps["node"][];
  };
  path: string;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onCopy: (text: string) => void;
  level: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  path,
  expandedFolders,
  toggleFolder,
  onCopy,
  level,
}) => {
  const theme = useTheme();
  const isFolder = node.type === "folder";
  const isExpanded = expandedFolders.has(path);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <Box>
      <Box
        onClick={() => (isFolder && hasChildren ? toggleFolder(path) : onCopy(path))}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          py: "4px",
          pl: `${level * 16}px`,
          cursor: "pointer",
          borderRadius: "2px",
          "&:hover": {
            backgroundColor: theme.palette.background.fill,
          },
        }}
      >
        {isFolder ? (
          <>
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )
            ) : (
              <Box sx={{ width: 12 }} />
            )}
            {isExpanded ? (
              <FolderOpen size={14} color={theme.palette.status.warning.text} />
            ) : (
              <Folder size={14} color={theme.palette.status.warning.text} />
            )}
          </>
        ) : (
          <>
            <Box sx={{ width: 12 }} />
            <FileText size={14} color={theme.palette.text.tertiary} />
          </>
        )}
        <Typography
          sx={{
            fontSize: 12,
            color: isFolder ? theme.palette.text.primary : theme.palette.text.secondary,
            fontWeight: isFolder ? 500 : 400,
          }}
        >
          {node.name}
        </Typography>
        {node.description && (
          <Typography
            sx={{
              fontSize: 10,
              color: theme.palette.text.accent,
              ml: "8px",
            }}
          >
            — {node.description}
          </Typography>
        )}
      </Box>

      {isFolder && isExpanded && hasChildren && (
        <Box>
          {node.children!.map((child) => (
            <TreeNode
              key={child.name}
              node={child}
              path={`${path}/${child.name}`}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              onCopy={onCopy}
              level={level + 1}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

// Layer Card Component
const LayerCard: React.FC<{ name: string; description: string; color: string }> = ({
  name,
  description,
  color,
}) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        p: "12px",
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <Box>
        <Typography
          sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.primary, mb: "4px" }}
        >
          {name}/
        </Typography>
        <Typography sx={{ fontSize: 11, color: theme.palette.text.tertiary }}>
          {description}
        </Typography>
      </Box>
    </Box>
  );
};

// Helper Component
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

export default FileStructureSection;
