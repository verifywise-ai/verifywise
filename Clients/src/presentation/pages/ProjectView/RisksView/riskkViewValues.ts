export type RiskData = {
  total: number;
  veryHighRisks: number;
  highRisks: number;
  mediumRisks: number;
  lowRisks: number;
  veryLowRisks: number;
};

export type ProjectOverview = {
  projectTitle: string;
  owner: string;
  lastUpdated: string;
  lastUpdatedBy: string;
  controlsStatus: {
    totalControls: number;
    completedControls: number;
  };
  assessmentsStatus: {
    totalAssessments: number;
    completedAssessments: number;
  };
  projectRisks: RiskData;
  vendorRisks: RiskData;
};

const projectOverviewData: ProjectOverview = {
  projectTitle: "Chatbot AI",
  owner: "Rachelle Swing",
  lastUpdated: "2 January 2024",
  lastUpdatedBy: "George Michael",
  controlsStatus: {
    totalControls: 49,
    completedControls: 17,
  },
  assessmentsStatus: {
    totalAssessments: 92,
    completedAssessments: 10,
  },
  projectRisks: {
    total: 23,
    veryHighRisks: 13,
    highRisks: 4,
    mediumRisks: 4,
    lowRisks: 1,
    veryLowRisks: 1,
  },
  vendorRisks: {
    total: 23,
    veryHighRisks: 13,
    highRisks: 4,
    mediumRisks: 4,
    lowRisks: 1,
    veryLowRisks: 1,
  },
};

export default projectOverviewData;
