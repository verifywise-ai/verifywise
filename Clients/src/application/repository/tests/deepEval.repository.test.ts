import {
  addLlmApiKey,
  addProjectToOrg,
  clearCurrentOrg,
  createArenaComparison,
  createExperiment,
  createLog,
  createMetric,
  createOrg,
  createProject,
  createScorer,
  deleteArenaComparison,
  deleteBiasAudit,
  deleteDatasets,
  deleteExperiment,
  deleteLlmApiKey,
  deleteOrg,
  deleteProject,
  deleteScorer,
  getAllExperiments,
  getAllLlmApiKeys,
  getAllOrgs,
  getAllProjects,
  getArenaComparisonResults,
  getArenaComparisonStatus,
  getBiasAuditPreset,
  getBiasAuditResults,
  getBiasAuditStatus,
  getCurrentOrg,
  getExperiment,
  getExperiments,
  getLog,
  getLogs,
  getMetricAggregates,
  getMetrics,
  getMonitorDashboard,
  getProject,
  getProjectsForOrg,
  getProjectStats,
  getTraceLogs,
  hasLlmApiKey,
  listArenaComparisons,
  listBiasAuditPresets,
  listBiasAudits,
  listDatasets,
  listMyDatasets,
  listScorers,
  listUploads,
  parseBiasAuditCsvHeaders,
  readDataset,
  runBiasAudit,
  setCurrentOrg,
  testScorer,
  updateExperiment,
  updateExperimentStatus,
  updateOrg,
  updateProject,
  updateScorer,
  uploadDataset,
  validateModel,
  validateModelForExperiment,
  verifyLlmApiKey,
} from "../deepEval.repository";

// ── service mocks (hoisted so vi.mock factories can reference them) ──────────

const {
  mockProjectsService,
  mockDatasetsService,
  mockScorersService,
  mockOrgsService,
  mockLlmKeysService,
  mockLogsService,
  mockMetricsService,
  mockExperimentsService,
  mockMonitoringService,
  mockModelValidationService,
  mockArenaService,
  mockBiasAuditService,
} = vi.hoisted(() => ({
  mockProjectsService: {
    createProject: vi.fn(),
    getAllProjects: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    getProjectStats: vi.fn(),
  },
  mockDatasetsService: {
    uploadDataset: vi.fn(),
    list: vi.fn(),
    read: vi.fn(),
    listUploads: vi.fn(),
    listMy: vi.fn(),
    deleteDatasets: vi.fn(),
  },
  mockScorersService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    test: vi.fn(),
  },
  mockOrgsService: {
    getAllOrgs: vi.fn(),
    createOrg: vi.fn(),
    updateOrg: vi.fn(),
    deleteOrg: vi.fn(),
    getProjectsForOrg: vi.fn(),
    setCurrentOrg: vi.fn(),
    getCurrentOrg: vi.fn(),
    clearCurrentOrg: vi.fn(),
    addProjectToOrg: vi.fn(),
  },
  mockLlmKeysService: {
    getAllKeys: vi.fn(),
    addKey: vi.fn(),
    deleteKey: vi.fn(),
    hasKey: vi.fn(),
    verifyKey: vi.fn(),
  },
  mockLogsService: {
    createLog: vi.fn(),
    getLogs: vi.fn(),
    getLog: vi.fn(),
    getTraceLogs: vi.fn(),
  },
  mockMetricsService: {
    createMetric: vi.fn(),
    getMetrics: vi.fn(),
    getMetricAggregates: vi.fn(),
  },
  mockExperimentsService: {
    createExperiment: vi.fn(),
    getExperiments: vi.fn(),
    getAllExperiments: vi.fn(),
    getExperiment: vi.fn(),
    updateExperiment: vi.fn(),
    updateExperimentStatus: vi.fn(),
    deleteExperiment: vi.fn(),
    validateModelForExperiment: vi.fn(),
  },
  mockMonitoringService: {
    getDashboard: vi.fn(),
  },
  mockModelValidationService: {
    validateModel: vi.fn(),
  },
  mockArenaService: {
    createComparison: vi.fn(),
    listComparisons: vi.fn(),
    getComparisonStatus: vi.fn(),
    getComparisonResults: vi.fn(),
    deleteComparison: vi.fn(),
  },
  mockBiasAuditService: {
    listPresets: vi.fn(),
    getPreset: vi.fn(),
    runAudit: vi.fn(),
    getStatus: vi.fn(),
    getResults: vi.fn(),
    listAudits: vi.fn(),
    deleteAudit: vi.fn(),
    parseHeaders: vi.fn(),
  },
}));

vi.mock("../../../infrastructure/api/deepEvalProjectsService", () => ({
  deepEvalProjectsService: mockProjectsService,
}));

vi.mock("../../../infrastructure/api/deepEvalDatasetsService", () => ({
  deepEvalDatasetsService: mockDatasetsService,
  isSingleTurnPrompt: vi.fn(),
  isMultiTurnConversation: vi.fn(),
}));

vi.mock("../../../infrastructure/api/deepEvalScorersService", () => ({
  deepEvalScorersService: mockScorersService,
}));

vi.mock("../../../infrastructure/api/deepEvalOrgsService", () => ({
  deepEvalOrgsService: mockOrgsService,
}));

vi.mock("../../../infrastructure/api/evaluationLlmApiKeysService", () => ({
  evaluationLlmApiKeysService: mockLlmKeysService,
}));

vi.mock("../../../infrastructure/api/evaluationLogsService", () => ({
  evaluationLogsService: mockLogsService,
  metricsService: mockMetricsService,
  experimentsService: mockExperimentsService,
  monitoringService: mockMonitoringService,
  modelValidationService: mockModelValidationService,
}));

vi.mock("../../../infrastructure/api/deepEvalArenaService", () => ({
  deepEvalArenaService: mockArenaService,
}));

vi.mock("../../../infrastructure/api/biasAuditService", () => ({
  biasAuditService: mockBiasAuditService,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── PROJECTS ─────────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Projects", () => {
  it("createProject delegates to deepEvalProjectsService.createProject", () => {
    const data = { name: "My Project" };
    createProject(data);
    expect(mockProjectsService.createProject).toHaveBeenCalledWith(data);
  });

  it("getAllProjects delegates to deepEvalProjectsService.getAllProjects", () => {
    getAllProjects();
    expect(mockProjectsService.getAllProjects).toHaveBeenCalled();
  });

  it("getProject delegates with projectId", () => {
    getProject("p1");
    expect(mockProjectsService.getProject).toHaveBeenCalledWith("p1");
  });

  it("updateProject delegates with projectId and data", () => {
    const data = { name: "Updated" };
    updateProject("p1", data);
    expect(mockProjectsService.updateProject).toHaveBeenCalledWith("p1", data);
  });

  it("deleteProject delegates with projectId", () => {
    deleteProject("p1");
    expect(mockProjectsService.deleteProject).toHaveBeenCalledWith("p1");
  });

  it("getProjectStats delegates with projectId", () => {
    getProjectStats("p1");
    expect(mockProjectsService.getProjectStats).toHaveBeenCalledWith("p1");
  });
});

// ── DATASETS ─────────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Datasets", () => {
  it("uploadDataset delegates with all arguments", () => {
    const file = new File([""], "data.csv");
    uploadDataset(file, "agent", "multi-turn", "org1");
    expect(mockDatasetsService.uploadDataset).toHaveBeenCalledWith(
      file,
      "agent",
      "multi-turn",
      "org1",
    );
  });

  it("listDatasets delegates to datasetsService.list", () => {
    listDatasets();
    expect(mockDatasetsService.list).toHaveBeenCalled();
  });

  it("readDataset delegates with path", () => {
    readDataset("/data/file.csv");
    expect(mockDatasetsService.read).toHaveBeenCalledWith("/data/file.csv");
  });

  it("listUploads delegates to datasetsService.listUploads", () => {
    listUploads();
    expect(mockDatasetsService.listUploads).toHaveBeenCalled();
  });

  it("listMyDatasets delegates to datasetsService.listMy", () => {
    listMyDatasets();
    expect(mockDatasetsService.listMy).toHaveBeenCalled();
  });

  it("deleteDatasets delegates with paths array", () => {
    deleteDatasets(["a.csv", "b.csv"]);
    expect(mockDatasetsService.deleteDatasets).toHaveBeenCalledWith([
      "a.csv",
      "b.csv",
    ]);
  });
});

// ── SCORERS ───────────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Scorers", () => {
  it("listScorers delegates with params", () => {
    listScorers({ org_id: "org1" });
    expect(mockScorersService.list).toHaveBeenCalledWith({ org_id: "org1" });
  });

  it("listScorers delegates with no params", () => {
    listScorers();
    expect(mockScorersService.list).toHaveBeenCalledWith(undefined);
  });

  it("createScorer delegates with payload", () => {
    const payload = { name: "Scorer A" } as any;
    createScorer(payload);
    expect(mockScorersService.create).toHaveBeenCalledWith(payload);
  });

  it("updateScorer delegates with id and payload", () => {
    const payload = { name: "Updated" } as any;
    updateScorer("s1", payload);
    expect(mockScorersService.update).toHaveBeenCalledWith("s1", payload);
  });

  it("deleteScorer delegates with id", () => {
    deleteScorer("s1");
    expect(mockScorersService.delete).toHaveBeenCalledWith("s1");
  });

  it("testScorer delegates with id and payload", () => {
    const payload = { input: "test" } as any;
    testScorer("s1", payload);
    expect(mockScorersService.test).toHaveBeenCalledWith("s1", payload);
  });
});

// ── ORGANIZATIONS ─────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Organizations", () => {
  it("getAllOrgs delegates", () => {
    getAllOrgs();
    expect(mockOrgsService.getAllOrgs).toHaveBeenCalled();
  });

  it("createOrg delegates with name and memberIds", () => {
    createOrg("Org A", [1, 2]);
    expect(mockOrgsService.createOrg).toHaveBeenCalledWith("Org A", [1, 2]);
  });

  it("updateOrg delegates with orgId, name and memberIds", () => {
    updateOrg("o1", "New Name", [3]);
    expect(mockOrgsService.updateOrg).toHaveBeenCalledWith(
      "o1",
      "New Name",
      [3],
    );
  });

  it("deleteOrg delegates with orgId", () => {
    deleteOrg("o1");
    expect(mockOrgsService.deleteOrg).toHaveBeenCalledWith("o1");
  });

  it("getProjectsForOrg delegates with orgId", () => {
    getProjectsForOrg("o1");
    expect(mockOrgsService.getProjectsForOrg).toHaveBeenCalledWith("o1");
  });

  it("setCurrentOrg delegates with orgId", () => {
    setCurrentOrg("o1");
    expect(mockOrgsService.setCurrentOrg).toHaveBeenCalledWith("o1");
  });

  it("getCurrentOrg delegates", () => {
    getCurrentOrg();
    expect(mockOrgsService.getCurrentOrg).toHaveBeenCalled();
  });

  it("clearCurrentOrg delegates", () => {
    clearCurrentOrg();
    expect(mockOrgsService.clearCurrentOrg).toHaveBeenCalled();
  });

  it("addProjectToOrg delegates with orgId and projectId", () => {
    addProjectToOrg("o1", "p1");
    expect(mockOrgsService.addProjectToOrg).toHaveBeenCalledWith("o1", "p1");
  });
});

// ── LLM API KEYS ──────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – LLM API Keys", () => {
  it("getAllLlmApiKeys delegates", () => {
    getAllLlmApiKeys();
    expect(mockLlmKeysService.getAllKeys).toHaveBeenCalled();
  });

  it("addLlmApiKey delegates with request", () => {
    const req = { provider: "openai" as any, apiKey: "sk-abc" };
    addLlmApiKey(req);
    expect(mockLlmKeysService.addKey).toHaveBeenCalledWith(req);
  });

  it("deleteLlmApiKey delegates with provider", () => {
    deleteLlmApiKey("openai" as any);
    expect(mockLlmKeysService.deleteKey).toHaveBeenCalledWith("openai");
  });

  it("hasLlmApiKey delegates with provider", () => {
    hasLlmApiKey("openai" as any);
    expect(mockLlmKeysService.hasKey).toHaveBeenCalledWith("openai");
  });

  it("verifyLlmApiKey delegates with provider and apiKey", () => {
    verifyLlmApiKey("openai", "sk-abc");
    expect(mockLlmKeysService.verifyKey).toHaveBeenCalledWith({
      provider: "openai",
      apiKey: "sk-abc",
    });
  });
});

// ── EVALUATION LOGS ───────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Evaluation Logs", () => {
  it("createLog delegates with data", () => {
    const data = { traceId: "t1" } as any;
    createLog(data);
    expect(mockLogsService.createLog).toHaveBeenCalledWith(data);
  });

  it("getLogs delegates with params", () => {
    const params = { page: 1 } as any;
    getLogs(params);
    expect(mockLogsService.getLogs).toHaveBeenCalledWith(params);
  });

  it("getLog delegates with logId", () => {
    getLog("l1");
    expect(mockLogsService.getLog).toHaveBeenCalledWith("l1");
  });

  it("getTraceLogs delegates with traceId", () => {
    getTraceLogs("trace1");
    expect(mockLogsService.getTraceLogs).toHaveBeenCalledWith("trace1");
  });
});

// ── METRICS ───────────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Metrics", () => {
  it("createMetric delegates with data", () => {
    const data = { name: "accuracy" } as any;
    createMetric(data);
    expect(mockMetricsService.createMetric).toHaveBeenCalledWith(data);
  });

  it("getMetrics delegates with params", () => {
    const params = { projectId: "p1" } as any;
    getMetrics(params);
    expect(mockMetricsService.getMetrics).toHaveBeenCalledWith(params);
  });

  it("getMetricAggregates delegates with params", () => {
    const params = { from: "2026-01-01" } as any;
    getMetricAggregates(params);
    expect(mockMetricsService.getMetricAggregates).toHaveBeenCalledWith(params);
  });
});

// ── MODEL VALIDATION ──────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Model Validation", () => {
  it("validateModel delegates with modelName and provider", () => {
    validateModel("gpt-4", "openai");
    expect(mockModelValidationService.validateModel).toHaveBeenCalledWith(
      "gpt-4",
      "openai",
    );
  });

  it("validateModelForExperiment delegates with config", () => {
    const config = { model: "gpt-4" };
    validateModelForExperiment(config);
    expect(
      mockExperimentsService.validateModelForExperiment,
    ).toHaveBeenCalledWith(config);
  });
});

// ── EXPERIMENTS ───────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Experiments", () => {
  it("createExperiment delegates with data", () => {
    const data = { name: "Exp1" } as any;
    createExperiment(data);
    expect(mockExperimentsService.createExperiment).toHaveBeenCalledWith(data);
  });

  it("getExperiments delegates with params", () => {
    const params = { page: 1 } as any;
    getExperiments(params);
    expect(mockExperimentsService.getExperiments).toHaveBeenCalledWith(params);
  });

  it("getAllExperiments delegates with params", () => {
    const params = { projectId: "p1" } as any;
    getAllExperiments(params);
    expect(mockExperimentsService.getAllExperiments).toHaveBeenCalledWith(
      params,
    );
  });

  it("getExperiment delegates with experimentId", () => {
    getExperiment("e1");
    expect(mockExperimentsService.getExperiment).toHaveBeenCalledWith("e1");
  });

  it("updateExperiment delegates with experimentId and data", () => {
    const data = { name: "Updated" } as any;
    updateExperiment("e1", data);
    expect(mockExperimentsService.updateExperiment).toHaveBeenCalledWith(
      "e1",
      data,
    );
  });

  it("updateExperimentStatus delegates with experimentId and data", () => {
    const data = { status: "running" } as any;
    updateExperimentStatus("e1", data);
    expect(mockExperimentsService.updateExperimentStatus).toHaveBeenCalledWith(
      "e1",
      data,
    );
  });

  it("deleteExperiment delegates with experimentId", () => {
    deleteExperiment("e1");
    expect(mockExperimentsService.deleteExperiment).toHaveBeenCalledWith("e1");
  });
});

// ── MONITORING ────────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Monitoring", () => {
  it("getMonitorDashboard delegates with projectId and params", () => {
    const params = { from: "2026-01-01" } as any;
    getMonitorDashboard("p1", params);
    expect(mockMonitoringService.getDashboard).toHaveBeenCalledWith(
      "p1",
      params,
    );
  });

  it("getMonitorDashboard delegates with projectId only", () => {
    getMonitorDashboard("p1");
    expect(mockMonitoringService.getDashboard).toHaveBeenCalledWith(
      "p1",
      undefined,
    );
  });
});

// ── ARENA ─────────────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Arena", () => {
  it("createArenaComparison delegates with data", () => {
    const data = { name: "Battle 1" } as any;
    createArenaComparison(data);
    expect(mockArenaService.createComparison).toHaveBeenCalledWith(data);
  });

  it("listArenaComparisons delegates with params", () => {
    listArenaComparisons({ org_id: "o1" });
    expect(mockArenaService.listComparisons).toHaveBeenCalledWith({
      org_id: "o1",
    });
  });

  it("listArenaComparisons delegates with no params", () => {
    listArenaComparisons();
    expect(mockArenaService.listComparisons).toHaveBeenCalledWith(undefined);
  });

  it("getArenaComparisonStatus delegates with comparisonId", () => {
    getArenaComparisonStatus("c1");
    expect(mockArenaService.getComparisonStatus).toHaveBeenCalledWith("c1");
  });

  it("getArenaComparisonResults delegates with comparisonId", () => {
    getArenaComparisonResults("c1");
    expect(mockArenaService.getComparisonResults).toHaveBeenCalledWith("c1");
  });

  it("deleteArenaComparison delegates with comparisonId", () => {
    deleteArenaComparison("c1");
    expect(mockArenaService.deleteComparison).toHaveBeenCalledWith("c1");
  });
});

// ── BIAS AUDITS ───────────────────────────────────────────────────────────────

describe("Test DeepEval Repository – Bias Audits", () => {
  it("listBiasAuditPresets delegates", () => {
    listBiasAuditPresets();
    expect(mockBiasAuditService.listPresets).toHaveBeenCalled();
  });

  it("getBiasAuditPreset delegates with presetId", () => {
    getBiasAuditPreset("preset1");
    expect(mockBiasAuditService.getPreset).toHaveBeenCalledWith("preset1");
  });

  it("runBiasAudit delegates with dataset file and config", () => {
    const file = new File([""], "data.csv");
    const config = { preset_id: "p1" } as any;
    runBiasAudit(file, config);
    expect(mockBiasAuditService.runAudit).toHaveBeenCalledWith(file, config);
  });

  it("getBiasAuditStatus delegates with auditId", () => {
    getBiasAuditStatus("a1");
    expect(mockBiasAuditService.getStatus).toHaveBeenCalledWith("a1");
  });

  it("getBiasAuditResults delegates with auditId", () => {
    getBiasAuditResults("a1");
    expect(mockBiasAuditService.getResults).toHaveBeenCalledWith("a1");
  });

  it("listBiasAudits delegates with params", () => {
    listBiasAudits({ org_id: "o1", project_id: "p1" });
    expect(mockBiasAuditService.listAudits).toHaveBeenCalledWith({
      org_id: "o1",
      project_id: "p1",
    });
  });

  it("listBiasAudits delegates with no params", () => {
    listBiasAudits();
    expect(mockBiasAuditService.listAudits).toHaveBeenCalledWith(undefined);
  });

  it("deleteBiasAudit delegates with auditId", () => {
    deleteBiasAudit("a1");
    expect(mockBiasAuditService.deleteAudit).toHaveBeenCalledWith("a1");
  });

  it("parseBiasAuditCsvHeaders delegates with dataset file", () => {
    const file = new File(["col1,col2"], "headers.csv");
    parseBiasAuditCsvHeaders(file);
    expect(mockBiasAuditService.parseHeaders).toHaveBeenCalledWith(file);
  });
});
