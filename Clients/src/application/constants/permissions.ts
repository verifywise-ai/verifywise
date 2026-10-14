const allowedRoles = {
  projects: {
    view: ["Admin", "Editor", "Auditor"],
    create: ["Admin", "Editor"],
    edit: ["Admin", "Editor"],
    delete: ["Admin", "Editor"],
    editTeamMembers: ["Admin"],
    // Mirrors the server's useCase.classify permission.
    classify: ["Admin", "Editor"],
  },
  projectRisks: {
    view: ["Admin", "Editor", "Auditor"],
    create: ["Admin", "Editor"],
    edit: ["Admin", "Editor"],
    delete: ["Admin", "Editor"],
  },
  vendors: {
    view: ["Admin", "Editor", "Auditor"],
    create: ["Admin", "Editor"],
    edit: ["Admin", "Editor"],
    delete: ["Admin", "Editor"],
  },
  frameworks: {
    view: ["Admin", "Editor", "Auditor"],
    edit: ["Admin", "Editor"],
    manage: ["Admin", "Editor"],
    audit: ["Admin", "Editor", "Auditor"],
  },
  organizations: {
    view: ["Admin", "Editor", "Auditor"],
    create: ["Admin"],
    edit: ["Admin"],
  },
  training: {
    view: ["Admin", "Editor", "Auditor"],
    create: ["Admin"],
    edit: ["Admin"],
    delete: ["Admin"],
  },
  modelInventory: {
    view: ["Admin", "Editor", "Auditor"],
    create: ["Admin", "Editor"],
    edit: ["Admin", "Editor"],
    delete: ["Admin", "Editor"],
  },
  slack: {
    view: ["Admin"],
    manage: ["Admin"],
  },
  features: {
    manage: ["Admin"],
  },
  apiKeys: {
    view: ["Admin"],
    manage: ["Admin"],
  },
  llmKeys: {
    view: ["Admin"],
    manage: ["Admin"],
  },
  evals: {
    view: ["Admin", "Editor", "Reviewer", "Auditor"],
    createProject: ["Admin", "Editor"],
    editProject: ["Admin", "Editor"],
    deleteProject: ["Admin", "Editor"],
    createExperiment: ["Admin", "Editor"],
    deleteExperiment: ["Admin", "Editor"],
    createScorer: ["Admin", "Editor"],
    editScorer: ["Admin", "Editor"],
    deleteScorer: ["Admin", "Editor"],
    uploadDataset: ["Admin", "Editor"],
    deleteDataset: ["Admin", "Editor"],
    manageApiKeys: ["Admin"],
  },
  postMarketMonitoring: {
    view: ["Admin", "Editor", "Auditor"],
    edit: ["Admin", "Editor"],
  },
};

export default allowedRoles;
