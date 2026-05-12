import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Stack } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabPanel from "@mui/lab/TabPanel";
import { GitCompareArrows, Layers, BarChart3, Compass } from "lucide-react";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import TabBar from "../../components/TabBar";
import { DashboardHeaderCard } from "../../components/Cards/DashboardHeaderCard";
import FrameworkMapper from "./FrameworkMapper";
import ScenarioBuilder from "./ScenarioBuilder";
import UnifiedInsights from "./UnifiedInsights";
import {
  useMappings,
  useScenarios,
  useGovernancePreferences,
} from "../../../application/hooks/useGovernanceOs";
import GovernanceOSEnableCTA from "./GovernanceOSEnableCTA";

const GovernanceOS = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState(tab || "mapper");

  const { data: mappings } = useMappings();
  const { data: scenarios } = useScenarios();
  const { data: preferences } = useGovernancePreferences();
  const isEnabled = preferences?.is_enabled ?? false;

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
    navigate(`/governance-os/${newValue}`, { replace: true });
  };

  const totalMappings = mappings?.length || 0;
  const totalScenarios = scenarios?.length || 0;
  const directMappings = (mappings || []).filter((m) => m.mapping_strength === "direct").length;
  const domains = [...new Set((mappings || []).map((m) => m.domain_tag).filter(Boolean))];

  const summaryCards = (
    <Stack direction="row" spacing={2} sx={{ width: "100%" }}>
      <DashboardHeaderCard
        title="Total Mappings"
        count={totalMappings}
        icon={<GitCompareArrows size={16} />}
        disableNavigation
      />
      <DashboardHeaderCard
        title="Direct Mappings"
        count={directMappings}
        icon={<Layers size={16} />}
        disableNavigation
      />
      <DashboardHeaderCard
        title="Governance Domains"
        count={domains.length}
        icon={<BarChart3 size={16} />}
        disableNavigation
      />
      <DashboardHeaderCard
        title="Scenarios"
        count={totalScenarios}
        icon={<Compass size={16} />}
        disableNavigation
      />
    </Stack>
  );

  return (
    <PageHeaderExtended
      title="Core Governance OS"
      description="Cross-framework intelligence layer with control mappings, governance scenarios, and unified coverage analysis."
      helpArticlePath="governance-os"
      tipBoxEntity="governance-os"
      summaryCards={isEnabled ? summaryCards : undefined}
    >
      {isEnabled ? (
        <TabContext value={activeTab}>
          <TabBar
            tabs={[
              {
                label: "Framework Mapper",
                value: "mapper",
                icon: "GitCompareArrows",
                tooltip: "Explore cross-framework control mappings",
              },
              {
                label: "Scenario Builder",
                value: "scenarios",
                icon: "Compass",
                tooltip: "Get framework recommendations based on your context",
              },
              {
                label: "Unified Insights",
                value: "insights",
                icon: "BarChart3",
                tooltip: "Per-project coverage and gap analysis",
              },
            ]}
            activeTab={activeTab}
            onChange={handleTabChange}
            dataJoyrideId="governance-os-tabs"
          />

          <TabPanel value="mapper" sx={{ px: 0, py: 2 }}>
            <FrameworkMapper />
          </TabPanel>

          <TabPanel value="scenarios" sx={{ px: 0, py: 2 }}>
            <ScenarioBuilder />
          </TabPanel>

          <TabPanel value="insights" sx={{ px: 0, py: 2 }}>
            <UnifiedInsights />
          </TabPanel>
        </TabContext>
      ) : (
        <GovernanceOSEnableCTA />
      )}
    </PageHeaderExtended>
  );
};

export default GovernanceOS;
