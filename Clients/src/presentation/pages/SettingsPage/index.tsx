import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import TabPanel from "@mui/lab/TabPanel";
import TabContext from "@mui/lab/TabContext";
import Profile from "./Profile/index";
import Password from "./Password/index";
import TeamManagement from "./Team/index";
import Organization from "./Organization";
import Preferences from "./Preferences/index";
import Features from "./Features/index";
import { useAuth } from "../../../application/hooks/useAuth";
import { useHasPermission, useMyPermissions } from "../../../application/hooks/useMyPermissions";
import { useCan } from "../../../application/hooks/useCan";
import ApiKeys from "./ApiKeys";
import McpConnect from "./McpConnect";
import AuditLedger from "./AuditLedger";
import DataRetention from "./DataRetention";
import EntraIdConfig from "./EntraIdConfig";
import { useSsoFeatureEnabled } from "../../../application/hooks/useSsoFeatureEnabled";
import CustomFieldsTab from "./CustomFields";
import AIApprovalRules from "./AIApprovalRules";
import RolesTab from "./Roles";
import TabBar, { TabItem } from "../../components/TabBar";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";

// Built-in tabs (defined outside component to avoid recreation on each render)
// Feature flag: the AI Approval Rules tab governs the in-platform AI agent /
// advisor write-operation approval engine. It is hidden from end users for now,
// alongside the AI Agent dashboard tabs (see SHOW_AI_AGENT_DASHBOARD_TABS in
// IntegratedDashboard). The tab, its component, and the backend stay in the
// codebase so the work is not lost; flip this to true to surface it again.
const SHOW_AI_APPROVAL_RULES = false;

const BUILT_IN_TABS = [
  "profile",
  "password",
  "preferences",
  "team",
  "organization",
  "features",
  "apikeys",
  "mcp",
  "audit-ledger",
  "data-retention",
  "sso",
  "custom-fields",
  "roles",
  ...(SHOW_AI_APPROVAL_RULES ? ["ai-approval-rules"] : []),
];

export default function ProfilePage() {
  const { userRoleName, isSuperAdmin } = useAuth();
  const ssoFeatureEnabled = useSsoFeatureEnabled();
  const location = useLocation();
  const navigate = useNavigate();
  // Team and Features stay Admin-only by role name: their server checks are
  // role-name checks too (updateUserById, featureSettings.ctrl), so a custom
  // role would only get controls the server refuses.
  const isTeamManagementDisabled = userRoleName !== "Admin";
  const isApiKeysDisabled = !useCan("apiKeys.admin");
  const isFeaturesDisabled = userRoleName !== "Admin";
  const isAuditLedgerDisabled = userRoleName !== "Admin";
  // Data retention follows the organization.admin permission its routes
  // authorize on, so a custom role granted it gets the tab too.
  const canManageRetention = useHasPermission("organization.admin", { fallbackToAdmin: true });
  // Roles admin: the roles.manage permission its routes authorize on (#5253).
  const canManageRoles = useHasPermission("roles.manage", { fallbackToAdmin: true });
  // Resolved means the permissions arrived (or failed, when the Admin fallback
  // applies). A disabled query (no user yet) is not resolved, even though
  // React Query reports it as not loading.
  const { permissions, error: permissionsError } = useMyPermissions();
  const permissionsResolved = permissions !== undefined || Boolean(permissionsError);
  const isCustomFieldsDisabled = userRoleName !== "Admin";
  // The MCP server admits organization Admins only (Servers/routes/mcp.route.ts).
  const isMcpHidden = userRoleName !== "Admin";

  const { tab } = useParams<{ tab?: string }>();

  const defaultTab = "profile";
  const [activeTab, setActiveTab] = useState(tab || defaultTab);

  const validTabs = useMemo(() => {
    let tabs = [...BUILT_IN_TABS];
    if (!ssoFeatureEnabled) {
      tabs = tabs.filter((t) => t !== "sso");
    }
    if (isMcpHidden) {
      tabs = tabs.filter((t) => t !== "mcp");
    }
    return tabs;
  }, [ssoFeatureEnabled, isMcpHidden]);

  // keep state synced with URL
  useEffect(() => {
    if (tab && validTabs.includes(tab)) {
      setActiveTab(tab);
    } else if (!tab) {
      setActiveTab(defaultTab);
    } else {
      navigate("/settings", { replace: true });
      setActiveTab(defaultTab);
    }
  }, [tab, validTabs, navigate]);

  // The Data retention panel only renders when permitted, so a direct link
  // without the permission would show an empty page. Once permissions are
  // known, fall back to the default tab instead.
  useEffect(() => {
    if (activeTab === "data-retention" && permissionsResolved && !canManageRetention) {
      navigate("/settings", { replace: true });
      setActiveTab(defaultTab);
    }
  }, [activeTab, permissionsResolved, canManageRetention, navigate]);

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
  }, [location.state, isTeamManagementDisabled, navigate, location.pathname, validTabs]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);

    if (newValue === defaultTab) navigate("/settings");
    else navigate(`/settings/${newValue}`);
  };

  return (
    <PageHeaderExtended
      title="Settings"
      description="Manage your profile, security, team members, and application preferences."
      helpArticlePath="settings/user-management"
      tipBoxEntity="settings"
    >
      <TabContext value={activeTab}>
        <TabBar
          tabs={[
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
            ...(!isMcpHidden
              ? [
                  {
                    label: "MCP",
                    value: "mcp",
                    icon: "Bot" as TabItem["icon"],
                    tooltip: "Connect Claude Code to this organization",
                  },
                ]
              : []),
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
            ...(canManageRetention
              ? [
                  {
                    label: "Data retention",
                    value: "data-retention",
                    icon: "Archive" as TabItem["icon"],
                    tooltip: "How long each kind of record is kept",
                  },
                ]
              : []),
            ...(ssoFeatureEnabled
              ? [
                  {
                    label: "SSO",
                    value: "sso",
                    icon: "Shield" as TabItem["icon"],
                    tooltip: "Configure Microsoft Entra ID single sign-on",
                  },
                ]
              : []),
            ...(!isCustomFieldsDisabled
              ? [
                  {
                    label: "Custom fields",
                    value: "custom-fields",
                    icon: "Settings" as TabItem["icon"],
                    tooltip:
                      "Define organization-specific fields on entities like Vendors, Policies, etc.",
                  },
                ]
              : []),
            ...(canManageRoles
              ? [
                  {
                    label: "Roles",
                    value: "roles",
                    icon: "User" as TabItem["icon"],
                    tooltip: "Edit what each custom role is allowed to do",
                  },
                ]
              : []),
            ...(SHOW_AI_APPROVAL_RULES && !isAuditLedgerDisabled
              ? [
                  {
                    label: "AI Approval Rules",
                    value: "ai-approval-rules",
                    icon: "Shield" as TabItem["icon"],
                    tooltip:
                      "Configure auto-approve, require-approval, and auto-reject rules for AI operations",
                  },
                ]
              : []),
          ]}
          activeTab={activeTab}
          onChange={handleTabChange}
          scrollable
        />

        <TabPanel sx={{ p: 0 }} value="profile">
          <Profile />
        </TabPanel>

        <TabPanel sx={{ p: 0 }} value="password">
          <Password />
        </TabPanel>

        <TabPanel sx={{ p: 0 }} value="preferences">
          <Preferences />
        </TabPanel>

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

        {!isMcpHidden && (
          <TabPanel sx={{ p: 0 }} value="mcp">
            <McpConnect
              disabledReason={
                isSuperAdmin
                  ? "You are also a super admin, so set up MCP from Super Admin → Settings → MCP. A connection made there gives you these tools and the super-admin ones together."
                  : undefined
              }
            />
          </TabPanel>
        )}

        {!isAuditLedgerDisabled && (
          <TabPanel sx={{ p: 0 }} value="audit-ledger">
            <AuditLedger />
          </TabPanel>
        )}
        {canManageRetention && (
          <TabPanel sx={{ p: 0 }} value="data-retention">
            <DataRetention />
          </TabPanel>
        )}

        {ssoFeatureEnabled && (
          <TabPanel sx={{ p: 0 }} value="sso">
            <EntraIdConfig />
          </TabPanel>
        )}
        {!isCustomFieldsDisabled && (
          <TabPanel sx={{ p: 0 }} value="custom-fields">
            <CustomFieldsTab />
          </TabPanel>
        )}
        {canManageRoles && (
          <TabPanel sx={{ p: 0 }} value="roles">
            <RolesTab />
          </TabPanel>
        )}
        {SHOW_AI_APPROVAL_RULES && !isAuditLedgerDisabled && (
          <TabPanel sx={{ p: 0 }} value="ai-approval-rules">
            <AIApprovalRules />
          </TabPanel>
        )}
      </TabContext>
    </PageHeaderExtended>
  );
}
