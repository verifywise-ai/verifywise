import React from "react";
import GovernanceLayout from "../shared/GovernanceLayout";
import FrameworkMapper from "../FrameworkMapper";

const FrameworkMapperModule: React.FC = () => {
  return (
    <GovernanceLayout
      title="Framework Mapper"
      subtitle="Explore cross-framework control mappings. Select source and target frameworks to see how controls align."
    >
      <FrameworkMapper />
    </GovernanceLayout>
  );
};

export default FrameworkMapperModule;
