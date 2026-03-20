import React, { useState, useCallback, useMemo, Suspense } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Box, Stack, Typography, Collapse, useTheme } from "@mui/material";
import { TabContext, TabPanel } from "@mui/lab";
import { ChevronDown, Puzzle, Download, Settings2, Shield } from "lucide-react";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import TabBar from "../../components/TabBar";
import PluginCard from "../../components/PluginCard";
import { SearchBox } from "../../components/Search";
import { usePlugins } from "../../../application/hooks/usePlugins";
import { usePluginInstallation } from "../../../application/hooks/usePluginInstallation";
import { Plugin, PluginInstallationStatus } from "../../../domain/types/plugins";
import Alert from "../../components/Alert";
import { useAuth } from "../../../application/hooks/useAuth";
import Chip from "../../components/Chip";
import { EmptyState } from "../../components/EmptyState";
import { CATEGORIES } from "./categories";
import {
  categorySidebar,
  categoryMenuItem,
  categoryMenuText,
  categoryHeader,
  categoryHeaderTitle,
  categoryHeaderDescription,
  pluginCardsGrid,
  pluginCardsGridThreeColumn,
  pluginCardWrapper,
  pluginCardWrapperThreeColumn,
  emptyStateContainer,
  emptyStateText,
  tabPanelStyle,
  regionHeader,
  regionChevron,
  regionFlagStyle,
  regionNameStyle,
  regionCountStyle,
  regionContent,
} from "./style";
import { brand } from "../../themes/palette";

const Plugins: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const { userRoleName } = useAuth();

  // Determine initial tab from URL
  const initialTab = location.pathname.includes("/my-plugins") ? "my-plugins" : "marketplace";

  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(initialTab);
  const { plugins, loading, refetch } = usePlugins(selectedCategory === "all" ? undefined : selectedCategory);
  const { uninstall, uninstalling } = usePluginInstallation();
  const [toast, setToast] = useState<{
    variant: "success" | "info" | "warning" | "error";
    body: string;
    visible: boolean;
  } | null>(null);
  // Track collapsed regions instead (empty = all expanded)
  const [collapsedRegions, setCollapsedRegions] = useState<Set<string>>(new Set());

  const isAdmin = userRoleName === "Admin";

  // Refetch plugins when navigating back to this page
  React.useEffect(() => {
    if (location.pathname.includes('/plugins') && !location.pathname.includes('/manage')) {
      refetch();
    }
  }, [location.pathname, refetch]);

  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: string) => {
      setActiveTab(newValue);
    },
    []
  );

  // Get current category config
  const currentCategory = useMemo(
    () => CATEGORIES.find((c) => c.id === selectedCategory) || CATEGORIES[0],
    [selectedCategory]
  );

  // Helper to check if a plugin is a framework plugin (based on category or tags)
  const isFrameworkPlugin = useCallback((plugin: Plugin) => {
    return (
      (plugin.category as string) === "compliance" ||
      (plugin.tags || []).some(
        (tag) =>
          tag.toLowerCase().includes("compliance") ||
          tag.toLowerCase().includes("framework")
      )
    );
  }, []);

  // Filter plugins by search query (excluding framework plugins from marketplace)
  const filteredPlugins = useMemo(() => {
    const nonFrameworkPlugins = plugins.filter((p) => !isFrameworkPlugin(p));
    if (!searchQuery) return nonFrameworkPlugins;
    const lowerQuery = searchQuery.toLowerCase();
    return nonFrameworkPlugins.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.description.toLowerCase().includes(lowerQuery) ||
        (p.tags || []).some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }, [plugins, searchQuery, isFrameworkPlugin]);

  // Filter to show only installed plugins
  const installedPlugins = useMemo(
    () => plugins.filter((p) => p.installationStatus === PluginInstallationStatus.INSTALLED),
    [plugins]
  );

  const frameworkPlugins = useMemo(
    () => plugins.filter((p) => isFrameworkPlugin(p)),
    [plugins, isFrameworkPlugin]
  );

  // Region flags mapping
  const regionFlags: Record<string, string> = {
    "International": "🌐",
    "United States": "🇺🇸",
    "European Union": "🇪🇺",
    "Canada": "🇨🇦",
    "United Kingdom": "🇬🇧",
    "Australia": "🇦🇺",
    "Singapore": "🇸🇬",
    "India": "🇮🇳",
    "Japan": "🇯🇵",
    "Brazil": "🇧🇷",
    "United Arab Emirates": "🇦🇪",
    "Saudi Arabia": "🇸🇦",
    "Qatar": "🇶🇦",
    "Bahrain": "🇧🇭",
    "Other": "📋",
  };

  // Group frameworks by region (from plugin metadata)
  const frameworksByRegion = useMemo(() => {
    const regionMap = new Map<string, Plugin[]>();

    frameworkPlugins.forEach((plugin) => {
      const region = plugin.region || "Other";
      if (!regionMap.has(region)) {
        regionMap.set(region, []);
      }
      regionMap.get(region)!.push(plugin);
    });

    // Convert to array and sort by region name
    return Array.from(regionMap.entries())
      .map(([regionName, plugins]) => ({
        region: regionName.toLowerCase().replace(/\s+/g, "-"),
        regionName,
        regionFlag: regionFlags[regionName] || "📋",
        plugins,
      }))
      .sort((a, b) => {
        // Put "Other" at the end, International first
        if (a.regionName === "Other") return 1;
        if (b.regionName === "Other") return -1;
        if (a.regionName === "International") return -1;
        if (b.regionName === "International") return 1;
        return a.regionName.localeCompare(b.regionName);
      });
  }, [frameworkPlugins]);

  // Handle plugin uninstallation
  const handleUninstall = useCallback(
    async (installationId: number, pluginKey: string) => {
      try {
        await uninstall(installationId, pluginKey);
        setToast({
          variant: "success",
          body: "Plugin uninstalled successfully!",
          visible: true,
        });
        refetch();
      } catch (err: unknown) {
        setToast({
          variant: "error",
          body: err instanceof Error ? err.message : "Failed to uninstall plugin. Please try again.",
          visible: true,
        });
      }
    },
    [uninstall, refetch]
  );

  // Handle plugin management
  const handleManage = useCallback(
    (plugin: Plugin) => {
      if (!plugin || !plugin.key) {
        setToast({
          variant: "error",
          body: "Invalid plugin data. Please refresh the page.",
          visible: true,
        });
        return;
      }
      navigate(`/plugins/${plugin.key}/manage`);
    },
    [navigate]
  );

  // Toggle region expansion (tracks collapsed regions - empty means all expanded)
  const toggleRegion = useCallback((regionKey: string) => {
    setCollapsedRegions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(regionKey)) {
        newSet.delete(regionKey);
      } else {
        newSet.add(regionKey);
      }
      return newSet;
    });
  }, []);

  // Close toast
  const handleCloseToast = () => {
    setToast(null);
  };

  // Auto-hide toast after 3 seconds
  React.useEffect(() => {
    if (toast && toast.visible) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [toast]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <PageHeaderExtended
      title="Plugins"
      description="Discover and manage plugins to extend VerifyWise functionality"
      alert={
        toast && toast.visible ? (
          <Suspense fallback={<div>Loading...</div>}>
            <Alert
              variant={toast.variant}
              body={toast.body}
              isToast={true}
              onClick={handleCloseToast}
            />
          </Suspense>
        ) : undefined
      }
    >
      <TabContext value={activeTab}>
        <Box>
          <TabBar
            tabs={[
              { label: "Marketplace", value: "marketplace", icon: "Store", tooltip: "Browse and install available plugins" },
              {
                label: "My plugins",
                value: "my-plugins",
                icon: "Package",
                count: installedPlugins.length,
                tooltip: "Plugins currently installed in your organization",
              },
              {
                label: "Frameworks",
                value: "frameworks",
                icon: "FileCode",
                count: frameworkPlugins.length,
                tooltip: "Compliance framework plugins and extensions",
              },
            ]}
            activeTab={activeTab}
            onChange={handleTabChange}
          />
        </Box>

        {/* Marketplace Tab */}
        <TabPanel value="marketplace" sx={tabPanelStyle}>
          <Stack direction="row" gap="16px">
            {/* Left Sidebar - Category Menu */}
            <Box sx={categorySidebar}>
              <Stack gap={0.5}>
                {CATEGORIES.map((category) => {
                  const Icon = category.icon;
                  const isSelected = selectedCategory === category.id;
                  return (
                    <Box
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      sx={categoryMenuItem(isSelected)}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "16px",
                          "& svg": {
                            color: isSelected ? "brand.primary !important" : "text.icon !important",
                            stroke: isSelected ? "brand.primary !important" : "text.icon !important",
                            transition: "color 0.2s ease, stroke 0.2s ease",
                          },
                          "& svg path": {
                            stroke: isSelected ? "brand.primary !important" : "text.icon !important",
                          },
                        }}
                      >
                        <Icon size={16} strokeWidth={1.5} />
                      </Box>
                      <Typography sx={categoryMenuText(isSelected)}>
                        {category.name}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            </Box>

            {/* Right Content Area */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack gap="16px">
                {/* Search Bar */}
                <SearchBox
                  placeholder="Search plugins by name, description, or tags..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  sx={{ maxWidth: 400 }}
                />

                {/* Category Header */}
                <Box sx={categoryHeader}>
                  <Stack direction="row" alignItems="center" gap={1.5} mb={1}>
                    {React.createElement(currentCategory.icon, {
                      size: 20,
                      color: "brand.primary",
                      strokeWidth: 1.5,
                    })}
                    <Typography sx={categoryHeaderTitle}>
                      {currentCategory.name}
                    </Typography>
                  </Stack>
                  <Typography sx={categoryHeaderDescription}>
                    {currentCategory.description}
                  </Typography>
                </Box>

                {/* Plugin Cards Grid */}
                {loading ? (
                  <Box sx={emptyStateContainer}>
                    <Typography sx={emptyStateText}>
                      Loading plugins...
                    </Typography>
                  </Box>
                ) : filteredPlugins.length === 0 ? (
                  <Box sx={emptyStateContainer}>
                    <Typography sx={emptyStateText}>
                      No plugins found matching your criteria
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={pluginCardsGrid}>
                    {filteredPlugins.map((plugin) => (
                      <Box key={plugin.key} sx={pluginCardWrapper}>
                        <PluginCard
                          plugin={plugin}
                          onUninstall={handleUninstall}
                          onManage={handleManage}
                          loading={
                            !!(plugin.installationId &&
                              uninstalling === plugin.installationId)
                          }
                        />
                      </Box>
                    ))}
                  </Box>
                )}
              </Stack>
            </Box>
          </Stack>
        </TabPanel>

        {/* My Plugins Tab */}
        <TabPanel value="my-plugins" sx={tabPanelStyle}>
          <Stack gap={2} sx={{ px: 2 }}>
            {/* Summary Chip - only show when there are installed plugins */}
            {installedPlugins.length > 0 && (
              <Box>
                <Chip
                  label={`${installedPlugins.length} plugin${installedPlugins.length !== 1 ? "s" : ""} installed`}
                  backgroundColor="rgba(19, 113, 91, 0.1)"
                  textColor={brand.primary}
                />
              </Box>
            )}

            {/* Plugin Cards Grid */}
            {loading ? (
              <Box sx={emptyStateContainer}>
                <Typography sx={emptyStateText}>
                  Loading plugins...
                </Typography>
              </Box>
            ) : installedPlugins.length === 0 ? (
              <EmptyState
                icon={Puzzle}
                message="No plugins installed yet. Visit the marketplace to install plugins."
                showBorder={true}
              >
                <EmptyStateTip
                  icon={Download}
                  title="Browse the marketplace"
                  description="The marketplace tab above lists available plugins for frameworks (SOC 2, GDPR, HIPAA), integrations (Slack, Jira), and more."
                />
                <EmptyStateTip
                  icon={Settings2}
                  title="Configure after install"
                  description="Once installed, each plugin appears here with a manage button. Configure API keys, mappings, and preferences from there."
                />
                <EmptyStateTip
                  icon={Shield}
                  title="Framework plugins"
                  description="Framework plugins add new compliance trackers and assessment templates. Install one to extend your governance coverage."
                />
              </EmptyState>
            ) : (
              <Box sx={pluginCardsGridThreeColumn}>
                {installedPlugins.map((plugin) => (
                  <Box key={plugin.key} sx={pluginCardWrapperThreeColumn}>
                    <PluginCard
                      plugin={plugin}
                      onUninstall={handleUninstall}
                      onManage={handleManage}
                      loading={
                        !!(
                          plugin.installationId &&
                          uninstalling === plugin.installationId
                        )
                      }
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Stack>
        </TabPanel>

        {/* Frameworks Tab */}
        <TabPanel value="frameworks" sx={tabPanelStyle}>
          <Stack gap={3}>
            {/* Framework Plugins by Region */}
            {loading ? (
              <Box sx={emptyStateContainer}>
                <Typography sx={emptyStateText}>
                  Loading framework plugins...
                </Typography>
              </Box>
            ) : frameworksByRegion.length === 0 ? (
              <Box sx={emptyStateContainer}>
                <Typography sx={emptyStateText}>
                  No framework plugins available.
                </Typography>
              </Box>
            ) : (
              frameworksByRegion.map(({ region, regionName, regionFlag, plugins: regionPlugins }) => {
                const isExpanded = !collapsedRegions.has(region);
                return (
                  <Stack key={region} gap={0}>
                    {/* Region Header - Clickable */}
                    <Box onClick={() => toggleRegion(region)} sx={regionHeader(theme)}>
                      <Box sx={regionChevron(theme, isExpanded)}>
                        <ChevronDown size={18} strokeWidth={2} />
                      </Box>
                      <Typography sx={regionFlagStyle}>
                        {regionFlag}
                      </Typography>
                      <Typography sx={regionNameStyle(theme)}>
                        {regionName}
                      </Typography>
                      <Typography sx={regionCountStyle(theme)}>
                        ({regionPlugins.length})
                      </Typography>
                    </Box>

                    {/* Region Plugins Grid - Collapsible */}
                    <Collapse in={isExpanded} timeout={250} unmountOnExit>
                      <Box sx={regionContent(theme)}>
                        {regionPlugins.map((plugin) => (
                          <Box key={plugin.key} sx={pluginCardWrapperThreeColumn}>
                            <PluginCard
                              plugin={plugin}
                              onUninstall={handleUninstall}
                              onManage={handleManage}
                              loading={
                                !!(
                                  plugin.installationId &&
                                  uninstalling === plugin.installationId
                                )
                              }
                            />
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  </Stack>
                );
              })
            )}
          </Stack>
        </TabPanel>
      </TabContext>
    </PageHeaderExtended>
  );
};

export default Plugins;
