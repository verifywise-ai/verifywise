import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TabContext from "@mui/lab/TabContext";
import TabBar from "../../../components/TabBar";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";

const TABS = [
  {
    value: "hub",
    label: "Hub",
    path: "/governance",
    icon: "LayoutDashboard" as const,
    tooltip: "Governance overview and module navigation",
  },
  {
    value: "framework-mapper",
    label: "Framework Mapper",
    path: "/governance/framework-mapper",
    icon: "GitCompareArrows" as const,
    tooltip: "Explore cross-framework control mappings",
  },
  {
    value: "scenarios",
    label: "Scenario Builder",
    path: "/governance/scenarios",
    icon: "Compass" as const,
    tooltip: "Governance scenarios and recommendations",
  },
  {
    value: "insights",
    label: "Unified Insights",
    path: "/governance/insights",
    icon: "BarChart3" as const,
    tooltip: "Coverage analysis and gap detection",
  },
  {
    value: "evidence",
    label: "Evidence Hub",
    path: "/governance/evidence",
    icon: "FileCheck" as const,
    tooltip: "Centralized compliance evidence",
  },
  {
    value: "knowledge-graph",
    label: "Knowledge Graph",
    path: "/governance/knowledge-graph",
    icon: "Network" as const,
    tooltip: "Visual governance relationships",
  },
  {
    value: "regulatory-radar",
    label: "Regulatory Radar",
    path: "/governance/regulatory-radar",
    icon: "Radio" as const,
    tooltip: "Monitor regulatory changes",
  },
  {
    value: "settings",
    label: "Settings",
    path: "/governance/settings",
    icon: "Settings" as const,
    tooltip: "Governance preferences",
  },
];

const PATH_TO_TAB: Record<string, string> = {
  "/governance": "hub",
  "/governance/framework-mapper": "framework-mapper",
  "/governance/scenarios": "scenarios",
  "/governance/insights": "insights",
  "/governance/evidence": "evidence",
  "/governance/knowledge-graph": "knowledge-graph",
  "/governance/regulatory-radar": "regulatory-radar",
  "/governance/settings": "settings",
};

interface GovernanceLayoutProps {
  title: string;
  subtitle?: string;
  helpArticlePath?: string;
  tipBoxEntity?: string;
  actionButton?: React.ReactNode;
  children: React.ReactNode;
}

const GovernanceLayout: React.FC<GovernanceLayoutProps> = ({
  title,
  subtitle,
  helpArticlePath,
  tipBoxEntity,
  actionButton,
  children,
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = PATH_TO_TAB[location.pathname] || "hub";

  const handleChange = (_: React.SyntheticEvent, newValue: string) => {
    const tab = TABS.find((t) => t.value === newValue);
    if (tab) {
      navigate(tab.path);
    }
  };

  return (
    <PageHeaderExtended
      title={title}
      description={subtitle}
      helpArticlePath={helpArticlePath}
      tipBoxEntity={tipBoxEntity}
      actionButton={actionButton}
    >
      <TabContext value={activeTab}>
        <TabBar
          tabs={TABS.map((t) => ({
            label: t.label,
            value: t.value,
            icon: t.icon,
            tooltip: t.tooltip,
          }))}
          activeTab={activeTab}
          onChange={handleChange}
          dataJoyrideId="governance-tabs"
        />
        {children}
      </TabContext>
    </PageHeaderExtended>
  );
};

export default GovernanceLayout;
