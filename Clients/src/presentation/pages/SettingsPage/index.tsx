import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import TabPanel from "@mui/lab/TabPanel";
import TabContext from "@mui/lab/TabContext";
import Profile from "./Profile/index";
import Password from "./Password/index";
import TeamManagement from "./Team/index";
import Organization from "./Organization";
import Preferences from "./Preferences/index";
import Features from "./Features/index";
import allowedRoles from "../../../application/constants/permissions";
import { useAuth } from "../../../application/hooks/useAuth";
import ApiKeys from "./ApiKeys";
import AuditLedger from "./AuditLedger";
import TabBar, { TabItem } from "../../components/TabBar";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { usePluginRegistry } from "../../../application/contexts/PluginRegistry.context";
import { PluginSlot } from "../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../domain/constants/pluginSlots";

// Built-in tabs (defined outside component to avoid recreation on each render)
const BUILT_IN_TABS = [
  "profile",
  "password",
  "preferences",
  "team",
  "organization",
  "features",
  "apikeys",
  "audit-ledger",
];

export default function ProfilePage() {
  const { userRoleName, isSuperAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isTeamManagementDisabled =
    !isSuperAdmin && !allowedRoles.projects.editTeamMembers.includes(userRoleName);
  const isApiKeysDisabled = !isSuperAdmin && !allowedRoles.apiKeys?.view?.includes(userRoleName);
  const isFeaturesDisabled = !isSuperAdmin && !allowedRoles.features?.manage?.includes(userRoleName);
  // Audit ledger: Admin-only (or super admin)
  const isAuditLedgerDisabled = !isSuperAdmin && userRoleName !== "Admin";

  // Get plugin tabs dynamically from the plugin registry
  const { getPluginTabs, installedPlugins, isLoading: pluginsLoading } = usePluginRegistry();
  const pluginTabs = useMemo(
    () => getPluginTabs(PLUGIN_SLOTS.SETTINGS_TABS),
    [getPluginTabs]
  );

  const { tab } = useParams<{ tab?: string }>();

  const defaultTab = isSuperAdmin ? "team" : "profile";
  const [activeTab, setActiveTab] = useState(tab || defaultTab);

  const validTabs = useMemo(() => {
    let tabs = [...BUILT_IN_TABS];
    if (isSuperAdmin) {
      tabs = tabs.filter((t) => !["profile", "password", "preferences"].includes(t));
    }
    return [...tabs, ...pluginTabs.map((t) => t.value)];
  }, [pluginTabs, isSuperAdmin]);

  // keep state synced with URL
  useEffect(() => {
    if (tab && validTabs.includes(tab)) {
      setActiveTab(tab);
    } else if (tab && !BUILT_IN_TABS.includes(tab)) {
      // Tab is not a built-in tab - it might be a plugin tab
      // Don't redirect if plugins are still loading or if plugin tabs haven't loaded yet
      if (!pluginsLoading && installedPlugins.length > 0 && pluginTabs.length === 0) {
        // Plugins are installed but tabs haven't loaded yet - wait
        return;
      }
      if (pluginsLoading) {
        // Plugins still loading - wait
        return;
      }
      // Plugins finished loading and tab is not valid - redirect
      navigate("/settings", { replace: true });
      setActiveTab(defaultTab);
    } else if (!tab) {
      // No tab specified - stay on profile
      setActiveTab(defaultTab);
    } else {
      // Invalid built-in tab - redirect
      navigate("/settings", { replace: true });
      setActiveTab(defaultTab);
    }
  }, [tab, validTabs, navigate, pluginsLoading, installedPlugins.length, pluginTabs.length]);

  // Handle navigation state from command palette
  useEffect(() => {
    if (location.state?.activeTab) {
      const requestedTab = location.state.activeTab;

      // Check if requested tab is valid and user has permission to access it
      if (validTabs.includes(requestedTab)) {
        if (requestedTab === "team" && isTeamManagementDisabled) {
          // If team management is requested but user doesn't have permission, stay on profile
          setActiveTab(defaultTab);
        } else {
          setActiveTab(requestedTab);
        }
      }

      // Clear the navigation state to prevent stale state issues
      navigate(location.pathname, { replace: true });
    }
  }, [
    location.state,
    isTeamManagementDisabled,
    navigate,
    location.pathname,
    validTabs,
  ]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);

    if (newValue === defaultTab) navigate("/settings");
    else navigate(`/settings/${newValue}`);
  };

  return (
    <PageHeaderExtended
      title={isSuperAdmin ? "Organization Settings" : "Settings"}
      description={
        isSuperAdmin
          ? "View organization settings for the selected organization."
          : "Manage your profile, security, team members, and application preferences."
      }
      helpArticlePath="settings/user-management"
      tipBoxEntity="settings"
    >
      <TabContext value={activeTab}>
        <TabBar
          tabs={[
            // User-level tabs: hidden for super admin
            ...(!isSuperAdmin
              ? [
                  {
                    label: "Profile",
                    value: "profile",
                    icon: "User" as TabItem["icon"],
                    tooltip: "Your name, email and personal details",
                  },
                  {
                    label: "Password",
                    value: "password",
                    icon: "Lock" as TabItem["icon"],
                    tooltip: "Update your account password",
                  },
                  {
                    label: "Preferences",
                    value: "preferences",
                    icon: "Settings" as TabItem["icon"],
                    tooltip: "Customize your display and notification preferences",
                  },
                ]
              : []),
            // Org-level tabs: always shown
            {
              label: "Team",
              value: "team",
              icon: "Users",
              disabled: isTeamManagementDisabled,
              tooltip: "Manage team members and their roles",
            },
            {
              label: "Organization",
              value: "organization",
              icon: "Building2",
              tooltip: "Organization name and general settings",
            },
            {
              label: "Features",
              value: "features",
              icon: "Zap",
              disabled: isFeaturesDisabled,
              tooltip: "Enable or disable optional platform features",
            },
            {
              label: "API Keys",
              value: "apikeys",
              icon: "Key",
              disabled: isApiKeysDisabled,
              tooltip: "Generate keys for programmatic API access",
            },
            ...(!isAuditLedgerDisabled
              ? [
                  {
                    label: "Audit ledger",
                    value: "audit-ledger",
                    icon: "FileCheck" as TabItem["icon"],
                    tooltip: "Tamper-proof log of all platform changes",
                  },
                ]
              : []),
            // Dynamically add plugin tabs
            ...pluginTabs.map((tab) => ({
              label: tab.label,
              value: tab.value,
              icon: (tab.icon || "Settings") as TabItem["icon"],
            })),
          ]}
          activeTab={activeTab}
          onChange={handleTabChange}
        />

        {!isSuperAdmin && (
          <>
            <TabPanel sx={{ p: 0 }} value="profile">
              <Profile />
            </TabPanel>

            <TabPanel sx={{ p: 0 }} value="password">
              <Password />
            </TabPanel>

            <TabPanel sx={{ p: 0 }} value="preferences">
              <Preferences />
            </TabPanel>
          </>
        )}

        <TabPanel sx={{ p: 0 }} value="team">
          <TeamManagement />
        </TabPanel>

        <TabPanel sx={{ p: 0 }} value="organization">
          <Organization />
        </TabPanel>

        <TabPanel sx={{ p: 0 }} value="features">
          <Features />
        </TabPanel>

        <TabPanel sx={{ p: 0 }} value="apikeys">
          <ApiKeys />
        </TabPanel>

        {!isAuditLedgerDisabled && (
          <TabPanel sx={{ p: 0 }} value="audit-ledger">
            <AuditLedger />
          </TabPanel>
        )}

        {/* Render plugin tab content dynamically */}
        {pluginTabs.some((tab) => tab.value === activeTab) && (
          <PluginSlot
            id={PLUGIN_SLOTS.SETTINGS_TABS}
            renderType="tab"
            activeTab={activeTab}
          />
        )}
      </TabContext>
    </PageHeaderExtended>
  );
}
