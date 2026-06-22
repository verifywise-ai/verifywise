import React from "react";
import GovernanceLayout from "../shared/GovernanceLayout";
import UnifiedInsights from "../UnifiedInsights";

const UnifiedInsightsModule: React.FC = () => {
  return (
    <GovernanceLayout
      title="Unified Insights"
      subtitle="View cross-framework coverage analysis per project. Identify gaps and synergies across your active frameworks."
    >
      <UnifiedInsights />
    </GovernanceLayout>
  );
};

export default UnifiedInsightsModule;
