import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { Box, Stack } from "@mui/material";
import {
  Archive,
  Bot,
  Building2,
  FileCheck,
  Key,
  ListPlus,
  Lock,
  ShieldCheck,
  Shield,
  SlidersHorizontal,
  User,
  UserCog,
  Users,
  UsersRound,
  Zap,
} from "lucide-react";
import Profile from "./Profile/index";
import Password from "./Password/index";
import TeamManagement from "./Team/index";
import Organization from "./Organization";
import Preferences from "./Preferences/index";
import Features from "./Features/index";
import { useAuth } from "../../../application/hooks/useAuth";
import { useCan, usePermissionsSettled } from "../../../application/hooks/useCan";
import ApiKeys from "./ApiKeys";
import McpConnect from "./McpConnect";
import AuditLedger from "./AuditLedger";
import DataRetention from "./DataRetention";
import EntraIdConfig from "./EntraIdConfig";
import { useSsoFeatureEnabled } from "../../../application/hooks/useSsoFeatureEnabled";
import CustomFieldsTab from "./CustomFields";
import AIApprovalRules from "./AIApprovalRules";
import RolesTab from "./Roles";
import GroupsTab from "./Groups";
import SectionSidebar, { SectionItem } from "../../components/SectionSidebar";
import Select from "../../components/Inputs/Select";
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
  "groups",
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

const NO_ACCESS_HINT = "You don't have access to this section.";

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
  const isAuditLedgerDisabled = !useCan("auditLedger.admin");
  // Data retention follows the organization.admin permission its routes
  // authorize on, so a custom role granted it gets the tab too.
  const canManageRetention = useCan("organization.admin");
  // Roles admin: the roles.manage permission its routes authorize on (#5253).
  const canManageRoles = useCan("roles.manage");
  // Settled: a built-in role at once, a custom role once its permissions
  // arrived or failed. A disabled query (no user yet) is not settled.
  const permissionsResolved = usePermissionsSettled();
  const isCustomFieldsDisabled = !useCan("customField.admin");
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

  const sections: SectionItem[] = [
    {
      id: "profile",
      label: "Profile",
      Icon: User,
      tooltip: "Your name, email and personal details",
    },
    { id: "password", label: "Password", Icon: Lock, tooltip: "Update your account password" },
    {
      id: "preferences",
      label: "Preferences",
      Icon: SlidersHorizontal,
      tooltip: "Customize your display and notification preferences",
    },
    {
      id: "team",
      label: "Team",
      Icon: Users,
      disabled: isTeamManagementDisabled,
      disabledTooltip: NO_ACCESS_HINT,
      tooltip: "Manage team members and their roles",
    },
    {
      id: "groups",
      label: "Groups",
      Icon: UsersRound,
      tooltip: "Bundle users into teams to give them use-case access together",
    },
    {
      id: "organization",
      label: "Organization",
      Icon: Building2,
      tooltip: "Organization name and general settings",
    },
    {
      id: "features",
      label: "Features",
      Icon: Zap,
      disabled: isFeaturesDisabled,
      disabledTooltip: NO_ACCESS_HINT,
      tooltip: "Enable or disable optional platform features",
    },
    {
      id: "apikeys",
      label: "API keys",
      Icon: Key,
      disabled: isApiKeysDisabled,
      disabledTooltip: NO_ACCESS_HINT,
      tooltip: "Generate keys for programmatic API access",
    },
    ...(!isMcpHidden
      ? [
          {
            id: "mcp",
            label: "MCP",
            Icon: Bot,
            tooltip: "Connect Claude Code to this organization",
          },
        ]
      : []),
    ...(!isAuditLedgerDisabled
      ? [
          {
            id: "audit-ledger",
            label: "Audit ledger",
            Icon: FileCheck,
            tooltip: "Tamper-proof log of all platform changes",
          },
        ]
      : []),
    ...(canManageRetention
      ? [
          {
            id: "data-retention",
            label: "Data retention",
            Icon: Archive,
            tooltip: "How long each kind of record is kept",
          },
        ]
      : []),
    ...(ssoFeatureEnabled
      ? [
          {
            id: "sso",
            label: "SSO",
            Icon: Shield,
            tooltip: "Configure Microsoft Entra ID single sign-on",
          },
        ]
      : []),
    ...(!isCustomFieldsDisabled
      ? [
          {
            id: "custom-fields",
            label: "Custom fields",
            Icon: ListPlus,
            tooltip: "Define organization-specific fields on entities like Vendors, Policies, etc.",
          },
        ]
      : []),
    ...(canManageRoles
      ? [
          {
            id: "roles",
            label: "Roles",
            Icon: UserCog,
            tooltip: "Edit what each custom role is allowed to do",
          },
        ]
      : []),
    ...(SHOW_AI_APPROVAL_RULES && !isAuditLedgerDisabled
      ? [
          {
            id: "ai-approval-rules",
            label: "AI approval rules",
            Icon: ShieldCheck,
            tooltip:
              "Configure auto-approve, require-approval, and auto-reject rules for AI operations",
          },
        ]
      : []),
  ];

  const handleTabChange = (newValue: string) => {
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
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ gap: "24px", alignItems: { xs: "stretch", md: "flex-start" }, mt: "16px" }}
      >
        <SectionSidebar
          sections={sections}
          activeSection={activeTab}
          onSelect={handleTabChange}
          width={220}
          stickyTop={16}
        />
        {/* Below md the sidebar is hidden; pick the section from a select instead. */}
        <Box sx={{ display: { xs: "block", md: "none" } }}>
          <Select
            id="settings-section"
            value={activeTab}
            ariaLabel="Settings section"
            items={sections
              .filter((section) => !section.disabled || section.id === activeTab)
              .map((section) => ({ _id: section.id, name: section.label }))}
            onChange={(e) => handleTabChange(String(e.target.value))}
            sx={{ width: "100%" }}
          />
        </Box>
        <Box
          component="section"
          aria-label={sections.find((section) => section.id === activeTab)?.label}
          sx={{ "flex": 1, "minWidth": 0, "& > :first-of-type": { mt: 0 } }}
        >
          {activeTab === "profile" && <Profile />}

          {activeTab === "password" && <Password />}

          {activeTab === "preferences" && <Preferences />}

          {activeTab === "team" && <TeamManagement />}

          {activeTab === "groups" && <GroupsTab />}

          {activeTab === "organization" && <Organization />}

          {activeTab === "features" && <Features />}

          {activeTab === "apikeys" && <ApiKeys />}

          {!isMcpHidden && activeTab === "mcp" && (
            <McpConnect
              disabledReason={
                isSuperAdmin
                  ? "You are also a super admin, so set up MCP from Super Admin → Settings → MCP. A connection made there gives you these tools and the super-admin ones together."
                  : undefined
              }
            />
          )}

          {!isAuditLedgerDisabled && activeTab === "audit-ledger" && <AuditLedger />}
          {canManageRetention && activeTab === "data-retention" && <DataRetention />}

          {ssoFeatureEnabled && activeTab === "sso" && <EntraIdConfig />}
          {!isCustomFieldsDisabled && activeTab === "custom-fields" && <CustomFieldsTab />}
          {canManageRoles && activeTab === "roles" && <RolesTab />}
          {SHOW_AI_APPROVAL_RULES &&
            !isAuditLedgerDisabled &&
            activeTab === "ai-approval-rules" && <AIApprovalRules />}
        </Box>
      </Stack>
    </PageHeaderExtended>
  );
}
