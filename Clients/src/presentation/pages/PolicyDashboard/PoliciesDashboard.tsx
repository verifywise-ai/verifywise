import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Box } from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import TabBar from "../../components/TabBar";
import PageTour from "../../components/PageTour";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { usePolicies } from "../../../application/hooks/usePolicies";
import { useTags } from "../../../application/hooks/useTags";
import PolicyManager from "./PolicyManager";
import PolicyTemplates from "./PolicyTemplates";
import PolicySteps from "./PolicySteps";

const PolicyDashboard: React.FC = () => {
  const { data: policies = [], isLoading: isPoliciesLoading } = usePolicies();
  const { data: tags = [], isLoading: isTagsLoading } = useTags();
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(true);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [templateCount, setTemplateCount] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const isPolicyTemplateTab = currentPath.includes("/policies/templates");
  const activeTab = isPolicyTemplateTab ? "templates" : "policies";

  useEffect(() => {
    setIsTemplatesLoading(true);
    fetch("/data/PolicyTemplates.json")
      .then((res) => res.json())
      .then((data: unknown[]) => setTemplateCount(data.length))
      .catch(() => {})
      .finally(() => setIsTemplatesLoading(false));
  }, []);

  useEffect(() => {
    if (!isPoliciesLoading && !isTagsLoading) {
      setIsInitialLoadComplete(true);
    }
  }, [isPoliciesLoading, isTagsLoading]);

  const handleTabChange = (_: React.SyntheticEvent, tabValue: string) => {
    if (tabValue === "policies") {
      navigate("/policies");
    } else if (tabValue === "templates") {
      navigate("/policies/templates");
    }
  };

  return (
    <PageHeaderExtended
      title="Policy manager"
      description="Create and manage AI governance policies using pre-built templates or custom documentation to stay compliant and consistent."
      helpArticlePath="policies/policy-management"
      tipBoxEntity="policies"
    >
      <TabContext value={activeTab}>
        <Box sx={{ mt: 2 }}>
          <TabBar
            tabs={[
              {
                label: "Organizational policies",
                value: "policies",
                icon: "Shield",
                count: policies.length,
                isLoading: isPoliciesLoading,
                tooltip: "Your organization's active policies",
              },
              {
                label: "Policy templates",
                value: "templates",
                icon: "ShieldHalf",
                count: templateCount,
                isLoading: isTemplatesLoading,
                tooltip: "Pre-built templates to create new policies from",
              },
            ]}
            activeTab={activeTab}
            onChange={handleTabChange}
            dataJoyrideId="policies-list-tab"
          />
        </Box>

        {activeTab === "policies" && <PolicyManager tags={tags} />}
        {activeTab === "templates" && <PolicyTemplates tags={tags} isLoading={isPoliciesLoading} />}

        <PageTour steps={PolicySteps} run={isInitialLoadComplete} tourKey="policy-tour" />
      </TabContext>
    </PageHeaderExtended>
  );
};

export default PolicyDashboard;
