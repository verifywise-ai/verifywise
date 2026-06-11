import React from "react";
import GovernanceLayout from "../shared/GovernanceLayout";
import ScenarioBuilder from "../ScenarioBuilder";

const ScenarioBuilderModule: React.FC = () => {
  return (
    <GovernanceLayout
      title="Scenario Builder"
      subtitle="Get framework recommendations based on your organization context, or browse and manage governance scenarios."
    >
      <ScenarioBuilder />
    </GovernanceLayout>
  );
};

export default ScenarioBuilderModule;
