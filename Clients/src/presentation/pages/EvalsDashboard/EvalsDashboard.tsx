import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Box, Stack, Typography, RadioGroup, FormControlLabel, Radio, Button, Card, CardContent, Grid } from "@mui/material";
import { Check } from "lucide-react";
import { FlaskConical, FileSearch, Bot, LayoutDashboard, Database, Award, Settings, Save, Workflow, KeyRound, Swords } from "lucide-react";
import { PageBreadcrumbs } from "../../components/breadcrumbs/PageBreadcrumbs";
import { PageHeader } from "../../components/Layout/PageHeader";
import { useEvalsSidebarContext } from "../../../application/contexts/EvalsSidebar.context";
import { useAuth } from "../../../application/hooks/useAuth";
import allowedRoles from "../../../application/constants/permissions";
import ModalStandard from "../../components/Modals/StandardModal";
import Field from "../../components/Inputs/Field";
import Alert from "../../components/Alert";
import { CustomizableButton } from "../../components/button/customizable-button";
import {
  getAllProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getAllExperiments,
  getExperiment,
  listMyDatasets,
  listScorers,
  listArenaComparisons,
  getAllOrgs,
  createOrg,
  setCurrentOrg,
  getCurrentOrg,
  getProjectsForOrg,
  addProjectToOrg,
  getAllLlmApiKeys,
  deleteLlmApiKey,
  addLlmApiKey,
  verifyLlmApiKey,
  type LLMApiKey,
} from "../../../application/repository/deepEval.repository";
import type { LLMProvider } from "../../../infrastructure/api/evaluationLlmApiKeysService";
import { evalModelsService } from "../../../infrastructure/api/evalModelsService";
import { Plus as PlusIcon, Trash2 as DeleteIcon } from "lucide-react";
import { Collapse, IconButton, CircularProgress } from "@mui/material";
import VWChip from "../../components/Chip";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import SelectableCard from "../../components/SelectableCard";
import { palette } from "../../themes/palette";

// Import provider logos
import { ReactComponent as OpenAILogo } from "../../assets/icons/openai_logo.svg";
import { ReactComponent as AnthropicLogo } from "../../assets/icons/anthropic_logo.svg";
import { ReactComponent as GeminiLogo } from "../../assets/icons/gemini_logo.svg";
import { ReactComponent as MistralLogo } from "../../assets/icons/mistral_logo.svg";
import { ReactComponent as XAILogo } from "../../assets/icons/xai_logo.svg";
import { ReactComponent as HuggingFaceLogo } from "../../assets/icons/huggingface_logo.svg";
import { ReactComponent as OpenRouterLogo } from "../../assets/icons/openrouter_logo.svg";
import { ReactComponent as OllamaLogo } from "../../assets/icons/ollama_logo.svg";
import { ReactComponent as FolderFilledIcon } from "../../assets/icons/folder_filled.svg";
import { ReactComponent as BuildIcon } from "../../assets/icons/build.svg";
import { ENV_VARs } from "../../../../env.vars";

// Tab components
import ProjectsList from "./ProjectsList";
import ProjectOverview from "./ProjectOverview";
import ProjectExperiments from "./ProjectExperiments";
import { ProjectDatasets } from "./ProjectDatasets";
import ProjectScorers from "./ProjectScorers";
import ModelsPage from "./ModelsPage";
import ExperimentDetailContent from "./ExperimentDetailContent";
import ArenaPage from "./ArenaPage";
import BiasAuditsList from "./BiasAuditsList";
import BiasAuditDetail from "./BiasAuditDetail";
import ReportPage from "./ReportPage";
import type { DeepEvalProject } from "./types";

// Track if Evals dashboard has been loaded before (persists across module switches)
let hasLoadedEvalsBefore = false;

const LLM_PROVIDERS = [
  { _id: "openrouter", name: "OpenRouter", Logo: OpenRouterLogo },
  { _id: "openai", name: "OpenAI", Logo: OpenAILogo },
  { _id: "anthropic", name: "Anthropic", Logo: AnthropicLogo },
  { _id: "google", name: "Gemini", Logo: GeminiLogo },
  { _id: "xai", name: "xAI", Logo: XAILogo },
  { _id: "mistral", name: "Mistral", Logo: MistralLogo },
  { _id: "huggingface", name: "Hugging Face", Logo: HuggingFaceLogo },
  { _id: "custom", name: "Custom", Logo: BuildIcon },
];

/**
 * API key format patterns for validation
 */
const API_KEY_PATTERNS: Record<string, { pattern: RegExp; example: string; description: string }> = {
  openai: {
    pattern: /^sk-(proj-)?[a-zA-Z0-9_-]{20,}$/,
    example: 'sk-... or sk-proj-...',
    description: 'OpenAI keys start with "sk-" or "sk-proj-"',
  },
  anthropic: {
    pattern: /^sk-ant-(api\d+-)?[a-zA-Z0-9_-]{20,}$/,
    example: 'sk-ant-api03-...',
    description: 'Anthropic keys start with "sk-ant-" (typically "sk-ant-api03-")',
  },
  google: {
    pattern: /^AIza[a-zA-Z0-9_-]{35,}$/,
    example: 'AIza...',
    description: 'Google API keys start with "AIza"',
  },
  xai: {
    pattern: /^xai-[a-zA-Z0-9_-]{20,}$/,
    example: 'xai-...',
    description: 'xAI keys start with "xai-"',
  },
  mistral: {
    pattern: /^[a-zA-Z0-9]{32,}$/,
    example: '32+ character alphanumeric string',
    description: 'Mistral keys are alphanumeric strings (32+ characters)',
  },
  huggingface: {
    pattern: /^hf_[a-zA-Z0-9]{20,}$/,
    example: 'hf_...',
    description: 'Hugging Face keys start with "hf_"',
  },
  openrouter: {
    pattern: /^sk-or-v1-[a-zA-Z0-9]{40,}$/,
    example: 'sk-or-v1-...',
    description: 'OpenRouter keys start with "sk-or-v1-"',
  },
  custom: {
    pattern: /^.{10,}$/,
    example: 'Any key (10+ characters)',
    description: 'Must be OpenAI-compatible API (POST /v1/chat/completions)',
  },
};

/**
 * Validate API key format for a specific provider
 * @returns null if valid, or error message if invalid
 */
function validateApiKeyFormat(provider: string, apiKey: string): string | null {
  const config = API_KEY_PATTERNS[provider];
  if (!config) {
    return null; // Unknown provider, skip format validation
  }

  const trimmedKey = apiKey.trim();

  if (!config.pattern.test(trimmedKey)) {
    return `Invalid format. ${config.description}`;
  }

  return null; // Valid
}

const LAST_PROJECT_KEY = "evals_last_project_id";
const RECENT_EXPERIMENTS_KEY = "evals_recent_experiments";
const RECENT_PROJECTS_KEY = "evals_recent_projects";
const LOCAL_PROVIDERS_KEY = "evals_local_providers";

interface RecentExperiment {
  id: string;
  name: string;
  projectId: string;
}

interface RecentProject {
  id: string;
  name: string;
}

interface LocalProvider {
  id: string;
  type: "ollama" | "local";
  name: string;
  url: string;
  addedAt: string;
}

export default function EvalsDashboard() {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { userRoleName } = useAuth();

  // Helper to check if user can perform write operations
  const canManageApiKeys = allowedRoles.evals.manageApiKeys.includes(userRoleName);

  // Determine tab from URL hash or default
  const [tab, setTab] = useState(() => {
    const hash = location.hash.replace("#", "");
    // When no projectId, default to "overview" to show projects list
    if (!projectId) {
      return "overview";
    }
    return hash || "overview";
  });

  // Keep tab in sync with URL hash so external navigations (e.g., from Overview button) work
  useEffect(() => {
    if (!projectId) return;
    const hash = location.hash.replace("#", "");
    setTab(hash || "overview");
  }, [location.hash, projectId]);

  // Persist projectId to localStorage when it changes
  useEffect(() => {
    if (projectId) {
      localStorage.setItem(LAST_PROJECT_KEY, projectId);
    }
  }, [projectId]);

  const [currentProject, setCurrentProject] = useState<DeepEvalProject | null>(null);
  const [allProjects, setAllProjects] = useState<DeepEvalProject[]>([]);
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);
  const [newProject, setNewProject] = useState<{ name: string; description: string; useCase: "chatbot" | "rag" | "agent" }>({ name: "", description: "", useCase: "chatbot" });
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [experimentsCount, setExperimentsCount] = useState<number>(0);
  const [datasetsCount, setDatasetsCount] = useState<number>(0);
  const [scorersCount, setScorersCount] = useState<number>(0);
  const [modelsCount, setModelsCount] = useState<number>(0);
  const [arenaCount, setArenaCount] = useState<number>(0);
  // Skip initial loading state if we've loaded before AND we're on a specific project
  // If no projectId, we might redirect to last project, so keep loading to prevent flash
  const shouldSkipLoading = hasLoadedEvalsBefore && !!projectId;
  const [initialLoading, setInitialLoading] = useState(!shouldSkipLoading);
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(null);
  const [selectedBiasAuditId, setSelectedBiasAuditId] = useState<string | null>(null);
  const [recentExperiments, setRecentExperiments] = useState<RecentExperiment[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_EXPERIMENTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // API key modal state
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyAlert, setApiKeyAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);

  // LLM API keys list state (for Settings-style display)
  const [llmApiKeys, setLlmApiKeys] = useState<LLMApiKey[]>([]);
  const [llmApiKeysLoading, setLlmApiKeysLoading] = useState(false);
  const [deletingKeyProvider, setDeletingKeyProvider] = useState<string | null>(null);

  // Local providers state
  const [localProviders, setLocalProviders] = useState<LocalProvider[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_PROVIDERS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [localProviderModalOpen, setLocalProviderModalOpen] = useState(false);
  const [selectedLocalProviderType, setSelectedLocalProviderType] = useState<"ollama" | "local" | "">("");
  const [localProviderName, setLocalProviderName] = useState("");
  const [localProviderUrl, setLocalProviderUrl] = useState("");
  const [localProviderSaving, setLocalProviderSaving] = useState(false);
  const [deletingLocalProviderId, setDeletingLocalProviderId] = useState<string | null>(null);
  const [deleteKeyModalOpen, setDeleteKeyModalOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<LLMApiKey | null>(null);

  // Onboarding state: "project" | null (null = completed) - org is auto-created
  const [onboardingStep, setOnboardingStep] = useState<"project" | null>(null);
  const [onboardingProjectName, setOnboardingProjectName] = useState("");
  const [onboardingProjectDesc, setOnboardingProjectDesc] = useState("");
  const [onboardingProjectUseCase, setOnboardingProjectUseCase] = useState<"chatbot" | "rag" | "agent">("chatbot");
  const [serverConnectionError, setServerConnectionError] = useState(false);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);

  // Configuration state (for tracking changes)
  const [originalUseCase, setOriginalUseCase] = useState<"rag" | "chatbot" | "agent" | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configAlert, setConfigAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);

  // Project actions state (rename, delete)
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [renameProjectName, setRenameProjectName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [projectActionAlert, setProjectActionAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);

  // Get sidebar context for sharing state with ContextSidebar
  const sidebarContext = useEvalsSidebarContext();

  // Helper function to add a recent experiment
  const addRecentExperiment = useCallback((experiment: RecentExperiment) => {
    setRecentExperiments((prev) => {
      const filtered = prev.filter((e) => e.id !== experiment.id);
      const updated = [experiment, ...filtered].slice(0, 10); // Keep max 10
      localStorage.setItem(RECENT_EXPERIMENTS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Helper function to add a recent project
  const addRecentProject = (project: RecentProject) => {
    setRecentProjects((prev) => {
      const filtered = prev.filter((p) => p.id !== project.id);
      const updated = [project, ...filtered].slice(0, 10); // Keep max 10
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // Track current project as recent when viewed
  useEffect(() => {
    if (projectId && currentProject) {
      addRecentProject({ id: currentProject.id, name: currentProject.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, currentProject?.id]);

  // Track experiment as recent when viewed
  useEffect(() => {
    if (selectedExperimentId && projectId) {
      // Fetch the experiment to get its name
      getExperiment(selectedExperimentId).then((data) => {
        if (data.experiment && data.experiment.name) {
          addRecentExperiment({
            id: selectedExperimentId,
            name: data.experiment.name,
            projectId: projectId,
          });
        }
        // If no name, don't add to recent - wait until experiment has a proper name
      }).catch(() => {
        // If fetch fails, don't add to recent experiments
        console.error("Failed to fetch experiment for recent list:", selectedExperimentId);
      });
    }
  }, [selectedExperimentId, projectId, addRecentExperiment]);

  // Auto-fix recent experiments that have ID-like names by re-fetching
  useEffect(() => {
    const fixRecentExperimentNames = async () => {
      const needsUpdate: RecentExperiment[] = [];

      for (const exp of recentExperiments) {
        // Check if name looks like an experiment ID (starts with "exp_")
        if (exp.name.startsWith("exp_")) {
          try {
            const data = await getExperiment(exp.id);
            if (data.experiment && data.experiment.name && !data.experiment.name.startsWith("exp_")) {
              needsUpdate.push({
                id: exp.id,
                name: data.experiment.name,
                projectId: exp.projectId,
              });
            }
          } catch {
            // Experiment might be deleted, skip it
          }
        }
      }

      // Update the entries that need fixing
      if (needsUpdate.length > 0) {
        setRecentExperiments((prev) => {
          const updated = prev.map((exp) => {
            const fix = needsUpdate.find((n) => n.id === exp.id);
            return fix || exp;
          });
          localStorage.setItem(RECENT_EXPERIMENTS_KEY, JSON.stringify(updated));
          return updated;
        });
      }
    };

    // Only run once on mount if there are experiments to check
    if (recentExperiments.some((exp) => exp.name.startsWith("exp_"))) {
      fixRecentExperimentNames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Load LLM API keys when configuration tab is active
  const fetchLlmApiKeys = async () => {
    setLlmApiKeysLoading(true);
    try {
      const keys = await getAllLlmApiKeys();
      setLlmApiKeys(keys);
    } catch (err) {
      console.error("Failed to fetch Provider API keys:", err);
    } finally {
      setLlmApiKeysLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "settings") {
      fetchLlmApiKeys();
    }
  }, [tab]);

  // Delete LLM API key handler
  const handleDeleteLlmKey = async () => {
    if (!keyToDelete) return;

    setDeletingKeyProvider(keyToDelete.provider);
    setDeleteKeyModalOpen(false);

    try {
      await deleteLlmApiKey(keyToDelete.provider);

      // Wait for animation then refresh
      setTimeout(async () => {
        setApiKeyAlert({ variant: "success", body: "API key deleted successfully" });
        setTimeout(() => setApiKeyAlert(null), 3000);
        await fetchLlmApiKeys();
        setDeletingKeyProvider(null);
        setKeyToDelete(null);
      }, 300);
    } catch {
      setDeletingKeyProvider(null);
      setApiKeyAlert({ variant: "error", body: "Failed to delete API key" });
      setTimeout(() => setApiKeyAlert(null), 5000);
    }
  };

  // Get provider display name
  const getProviderDisplayName = (provider: string): string => {
    const providerObj = LLM_PROVIDERS.find(p => p._id === provider);
    return providerObj?.name || provider.charAt(0).toUpperCase() + provider.slice(1);
  };

  // Local provider handlers
  const handleAddLocalProvider = () => {
    if (!selectedLocalProviderType || !localProviderUrl.trim()) return;

    setLocalProviderSaving(true);
    try {
      const newProvider: LocalProvider = {
        id: `local_${Date.now()}`,
        type: selectedLocalProviderType,
        name: localProviderName.trim() || (selectedLocalProviderType === "ollama" ? "Ollama" : "Local Endpoint"),
        url: localProviderUrl.trim(),
        addedAt: new Date().toISOString(),
      };

      const updatedProviders = [...localProviders, newProvider];
      setLocalProviders(updatedProviders);
      localStorage.setItem(LOCAL_PROVIDERS_KEY, JSON.stringify(updatedProviders));

      setApiKeyAlert({ variant: "success", body: `${newProvider.name} added successfully` });
      setTimeout(() => setApiKeyAlert(null), 3000);

      // Reset modal state
      setLocalProviderModalOpen(false);
      setSelectedLocalProviderType("");
      setLocalProviderName("");
      setLocalProviderUrl("");
    } catch {
      setApiKeyAlert({ variant: "error", body: "Failed to add local provider" });
      setTimeout(() => setApiKeyAlert(null), 5000);
    } finally {
      setLocalProviderSaving(false);
    }
  };

  const handleDeleteLocalProvider = (providerId: string) => {
    setDeletingLocalProviderId(providerId);
    setTimeout(() => {
      const updatedProviders = localProviders.filter(p => p.id !== providerId);
      setLocalProviders(updatedProviders);
      localStorage.setItem(LOCAL_PROVIDERS_KEY, JSON.stringify(updatedProviders));
      setDeletingLocalProviderId(null);
      setApiKeyAlert({ variant: "success", body: "Local provider removed" });
      setTimeout(() => setApiKeyAlert(null), 3000);
    }, 300);
  };

  // Format date for display
  const formatKeyDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "-";
    }
  };

  // Load current org on mount and auto-create default org if needed
  useEffect(() => {
    const loadAndCheckOnboarding = async () => {
      try {
        // Check if there are any organizations
        let { orgs } = await getAllOrgs();

        if (!orgs || orgs.length === 0) {
          // No organizations - auto-create a default one
          try {
            const { org: newOrg } = await createOrg("Default Organization");
            await setCurrentOrg(newOrg.id);
            setOrgId(newOrg.id);
            orgs = [newOrg];
          } catch (createErr) {
            console.error("Failed to create default organization:", createErr);
            setServerConnectionError(true);
            setOnboardingStep(null);
            return;
          }
        }

        // Has organizations - check for current org
        const { org } = await getCurrentOrg();
        if (org) {
          setOrgId(org.id);
        } else {
          // Has orgs but none selected - select first one
          await setCurrentOrg(orgs[0].id);
          setOrgId(orgs[0].id);
        }

        // If user explicitly navigated to #projects, skip auto-redirect and show projects list
        if (location.hash === "#projects") {
          setOnboardingStep(null);
          setInitialLoading(false);
          hasLoadedEvalsBefore = true;
          return;
        }

        // Check for last project - try to redirect regardless of org association
        const lastProjectId = localStorage.getItem(LAST_PROJECT_KEY);
        if (lastProjectId) {
          // Verify the project still exists
          try {
            const projectData = await getProject(lastProjectId);
            if (projectData?.project) {
              // Don't set initialLoading to false - keep showing nothing while redirecting
              navigate(`/evals/${lastProjectId}#overview`, { replace: true });
              return;
            }
          } catch {
            // Project doesn't exist anymore, clear from localStorage
            localStorage.removeItem(LAST_PROJECT_KEY);
          }
        }

        // No last project - check current org's projects for onboarding
        const currentOrgId = org?.id || orgs[0].id;
        const projectIds = await getProjectsForOrg(currentOrgId);
        if (!projectIds || projectIds.length === 0) {
          // Org exists but no projects - go to project step
          setOnboardingStep("project");
          setInitialLoading(false);
          hasLoadedEvalsBefore = true;
        } else if (projectIds.length > 0) {
          // Don't set initialLoading to false - keep showing nothing while redirecting
          navigate(`/evals/${projectIds[0]}#overview`, { replace: true });
          return;
        }
      } catch (err) {
        console.error("Failed to check onboarding:", err);
        // On error, set server connection error instead of forcing onboarding
        setServerConnectionError(true);
        setOnboardingStep(null);
        setInitialLoading(false);
        hasLoadedEvalsBefore = true;
      }
    };

    // Only run onboarding check when not viewing a specific project
    if (!projectId) {
      loadAndCheckOnboarding();
    } else {
      setInitialLoading(false);
      hasLoadedEvalsBefore = true;
    }
  }, [projectId, navigate, location.hash]);

  // Load all projects for the dropdown and current project
  // Also clean up recent projects/experiments that no longer exist
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await getAllProjects();
        // In future, filter by orgId if backend supports it or project.orgId is set.
        setAllProjects(data.projects);

        // Find and set the current project
        if (projectId) {
          const project = data.projects.find((p) => p.id === projectId);
          if (project) {
            setCurrentProject(project);
            setOriginalUseCase(project.useCase || "chatbot");
          }
        }

        // Clean up recent projects - remove any that no longer exist
        const existingProjectIds = new Set(data.projects.map((p) => p.id));
        setRecentProjects((prev) => {
          const filtered = prev.filter((p) => existingProjectIds.has(p.id));
          if (filtered.length !== prev.length) {
            localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(filtered));
          }
          return filtered;
        });

        // Clean up recent experiments - remove any whose projects no longer exist
        setRecentExperiments((prev) => {
          const filtered = prev.filter((e) => existingProjectIds.has(e.projectId));
          if (filtered.length !== prev.length) {
            localStorage.setItem(RECENT_EXPERIMENTS_KEY, JSON.stringify(filtered));
          }
          return filtered;
        });
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    };
    // Always load projects to clean up stale recent items
    loadProjects();
  }, [projectId]);

  // Handle saving configuration changes
  const handleSaveConfiguration = async () => {
    if (!projectId || !currentProject) return;

    setSavingConfig(true);
    try {
      await updateProject(projectId, {
        useCase: currentProject.useCase,
      });

      // Update the original use case to match the saved value
      setOriginalUseCase(currentProject.useCase || "chatbot");

      setConfigAlert({
        variant: "success",
        body: "Configuration saved successfully",
      });
      setTimeout(() => setConfigAlert(null), 3000);
    } catch (err) {
      console.error("Failed to save configuration:", err);
      setConfigAlert({
        variant: "error",
        body: err instanceof Error ? err.message : "Failed to save configuration",
      });
      setTimeout(() => setConfigAlert(null), 5000);
    } finally {
      setSavingConfig(false);
    }
  };

  // Check if use case has changed
  const hasUseCaseChanged = currentProject?.useCase !== originalUseCase && originalUseCase !== null;

  // Load experiments and datasets counts for the current project
  useEffect(() => {
    const loadCounts = async () => {
      if (!projectId || !currentProject) return;

      try {
        // Load experiments count
        const experimentsData = await getAllExperiments({
          project_id: projectId
        });
        setExperimentsCount(experimentsData.experiments?.length || 0);

        // Load datasets count - count user's custom datasets ("My datasets")
        const userDatasetsData = await listMyDatasets();
        setDatasetsCount(userDatasetsData.datasets?.length || 0);

        // Load scorers count
        const scorersData = await listScorers({ org_id: orgId || undefined });
        setScorersCount(scorersData.scorers?.length || 0);

        // Load saved models count
        const modelsData = await evalModelsService.listModels();
        setModelsCount(modelsData.length || 0);

        // Load arena battles count
        const arenaData = await listArenaComparisons();
        setArenaCount(arenaData.comparisons?.length || 0);
      } catch (err) {
        console.error("Failed to load counts:", err);
        setDatasetsCount(0);
        setScorersCount(0);
        setModelsCount(0);
        setArenaCount(0);
      }
    };

    loadCounts();
  }, [projectId, currentProject, orgId]);

  // Sync sidebar counts and callbacks with context (not activeTab - that's handled via URL)
  useEffect(() => {
    sidebarContext.setExperimentsCount(experimentsCount);
    sidebarContext.setDatasetsCount(datasetsCount);
    sidebarContext.setScorersCount(scorersCount);
    sidebarContext.setModelsCount(modelsCount);
    sidebarContext.setArenaCount(arenaCount);
    sidebarContext.setDisabled(!projectId && !currentProject);
    sidebarContext.setRecentExperiments(recentExperiments);
    sidebarContext.setRecentProjects(recentProjects);
    sidebarContext.setCurrentProject(currentProject);
    sidebarContext.setAllProjects(allProjects);
    sidebarContext.setOnExperimentClick(() => (experimentId: string, expProjectId: string) => {
      if (expProjectId !== projectId) {
        navigate(`/evals/${expProjectId}#experiments`);
        setTimeout(() => {
          setSelectedExperimentId(experimentId);
          setTab("experiments");
        }, 100);
      } else {
        setSelectedExperimentId(experimentId);
        setTab("experiments");
        navigate(`${location.pathname}#experiments`);
      }
    });
    sidebarContext.setOnProjectClick(() => (clickedProjectId: string) => {
      navigate(`/evals/${clickedProjectId}#overview`);
    });
    sidebarContext.setOnProjectChange(() => (newProjectId: string) => {
      if (newProjectId === "create_new") {
        setCreateProjectModalOpen(true);
      } else if (newProjectId === "all_projects") {
        // Clear last project from localStorage and navigate to projects list
        // Use #projects hash to bypass auto-redirect logic
        localStorage.removeItem(LAST_PROJECT_KEY);
        navigate("/evals#projects");
      } else {
        navigate(`/evals/${newProjectId}#${tab}`);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentsCount, datasetsCount, scorersCount, arenaCount, projectId, recentExperiments, recentProjects, currentProject, allProjects, tab, navigate, location.pathname]);

  // Note: Tab change is now handled via URL hash in ContextSidebar
  // Note: Project change is now handled via context in sidebar project selector

  const handleConfirmRename = async () => {
    if (!renameProjectId || !renameProjectName.trim()) return;
    setRenaming(true);
    try {
      await updateProject(renameProjectId, { name: renameProjectName.trim() });
      // Reload projects list
      const data = await getAllProjects();
      setAllProjects(data.projects);
      // Update current project if it was renamed
      if (projectId === renameProjectId) {
        const updated = data.projects.find((p) => p.id === renameProjectId);
        if (updated) setCurrentProject(updated);
      }
      setProjectActionAlert({ variant: "success", body: "Project renamed successfully" });
      setTimeout(() => setProjectActionAlert(null), 3000);
      setRenameModalOpen(false);
      setRenameProjectId(null);
      setRenameProjectName("");
    } catch (err) {
      setProjectActionAlert({ variant: "error", body: err instanceof Error ? err.message : "Failed to rename project" });
      setTimeout(() => setProjectActionAlert(null), 5000);
    } finally {
      setRenaming(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteProjectId) return;
    setDeleting(true);
    try {
      await deleteProject(deleteProjectId);
      // Reload projects list
      const data = await getAllProjects();
      setAllProjects(data.projects);

      // Remove deleted project from recent projects
      setRecentProjects((prev) => {
        const filtered = prev.filter((p) => p.id !== deleteProjectId);
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(filtered));
        return filtered;
      });

      // If we deleted the current project, navigate away
      if (projectId === deleteProjectId) {
        if (data.projects.length > 0) {
          navigate(`/evals/${data.projects[0].id}#overview`);
        } else {
          navigate("/evals#overview");
        }
      }
      setProjectActionAlert({ variant: "success", body: "Project deleted successfully" });
      setTimeout(() => setProjectActionAlert(null), 3000);
      setDeleteModalOpen(false);
      setDeleteProjectId(null);
    } catch (err) {
      setProjectActionAlert({ variant: "error", body: err instanceof Error ? err.message : "Failed to delete project" });
      setTimeout(() => setProjectActionAlert(null), 5000);
    } finally {
      setDeleting(false);
    }
  };

  // Organization is auto-created, no user interaction needed

  const handleSkipOnboarding = () => {
    setOnboardingStep(null);
    navigate("/evals");
  };

  const handleRetryConnection = async () => {
    setServerConnectionError(false);
    setInitialLoading(true);
    try {
      let { orgs } = await getAllOrgs();
      if (!orgs || orgs.length === 0) {
        // Auto-create default org
        try {
          const { org: newOrg } = await createOrg("Default Organization");
          await setCurrentOrg(newOrg.id);
          setOrgId(newOrg.id);
          orgs = [newOrg];
        } catch {
          setServerConnectionError(true);
          return;
        }
      }

      const { org } = await getCurrentOrg();
      if (org) {
        setOrgId(org.id);
      } else {
        await setCurrentOrg(orgs[0].id);
        setOrgId(orgs[0].id);
      }
      setOnboardingStep(null);
    } catch {
      setServerConnectionError(true);
    } finally {
      setInitialLoading(false);
      hasLoadedEvalsBefore = true;
    }
  };

  // Onboarding: Create project
  const handleOnboardingCreateProject = async () => {
    if (!onboardingProjectName.trim() || !orgId) return;
    setOnboardingSubmitting(true);
    try {
      await createProject({
        name: onboardingProjectName.trim(),
        description: onboardingProjectDesc,
        useCase: onboardingProjectUseCase,
        defaultDataset: onboardingProjectUseCase,
        orgId: orgId,
      });

      // Reload projects
      const data = await getAllProjects();
      setAllProjects(data.projects);

      // Link project to org and navigate
      const createdProject = data.projects.find((p) => p.name === onboardingProjectName.trim());
      if (createdProject) {
        try {
          await addProjectToOrg(orgId, createdProject.id);
        } catch (e) {
          console.warn("Failed to link project to org:", e);
        }
        // Onboarding complete - close modal and navigate
        setOnboardingStep(null);
        setOnboardingProjectName("");
        setOnboardingProjectDesc("");
        setOnboardingProjectUseCase("chatbot");
        navigate(`/evals/${createdProject.id}#overview`);
      } else {
        // If project not found, just close onboarding
        setOnboardingStep(null);
      }
    } catch (err) {
      console.error("Failed to create project:", err);
    } finally {
      setOnboardingSubmitting(false);
    }
  };

  const handleCreateProject = async () => {
    setLoading(true);
    try {
      await createProject({
        name: newProject.name,
        description: newProject.description,
        useCase: newProject.useCase,
        defaultDataset: newProject.useCase, // align preset with use case by default
        orgId: orgId || undefined,
      });

      // Reload projects
      const data = await getAllProjects();
      setAllProjects(data.projects);

      // Navigate to the newly created project
      const createdProject = data.projects.find((p) => p.name === newProject.name);
      if (createdProject) {
        if (orgId) {
          try {
            await addProjectToOrg(orgId, createdProject.id);
          } catch (e) {
            console.warn("Failed to link project to org:", e);
          }
        }
        navigate(`/evals/${createdProject.id}#overview`);
      }

      setCreateProjectModalOpen(false);
      setNewProject({ name: "", description: "", useCase: "chatbot" });
    } catch (err) {
      console.error("Failed to create project:", err);
      setCreateProjectError("Failed to create project. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Tab label and icon mapping for breadcrumbs
  const getTabInfo = (tabValue: string): { label: string; icon: React.ReactNode } => {
    const tabMap: Record<string, { label: string; icon: React.ReactNode }> = {
      overview: { label: "Overview", icon: <LayoutDashboard size={14} strokeWidth={1.5} /> },
      experiments: { label: "Experiments", icon: <FlaskConical size={14} strokeWidth={1.5} /> },
      datasets: { label: "Datasets", icon: <Database size={14} strokeWidth={1.5} /> },
      models: { label: "Models", icon: <Bot size={14} strokeWidth={1.5} /> },
      scorers: { label: "Scorers", icon: <Award size={14} strokeWidth={1.5} /> },
      "bias-audits": { label: "Bias audits", icon: <FileSearch size={14} strokeWidth={1.5} /> },
      arena: { label: "Arena", icon: <Swords size={14} strokeWidth={1.5} /> },
      configuration: { label: "Configuration", icon: <Settings size={14} strokeWidth={1.5} /> },
      settings: { label: "Settings", icon: <KeyRound size={14} strokeWidth={1.5} /> },
    };
    return tabMap[tabValue] || { label: tabValue, icon: <Workflow size={14} strokeWidth={1.5} /> };
  };

  // Handle API key input change with validation
  const handleApiKeyInputChange = (value: string) => {
    setNewApiKey(value);

    // Clear error if field is empty
    if (!value.trim()) {
      setApiKeyError(null);
      return;
    }

    // Validate if provider is selected
    if (selectedProvider) {
      const error = validateApiKeyFormat(selectedProvider, value);
      setApiKeyError(error);
    }
  };

  // Handle provider selection with re-validation
  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId);

    // Re-validate existing API key with new provider
    if (newApiKey.trim() && providerId) {
      const error = validateApiKeyFormat(providerId, newApiKey);
      setApiKeyError(error);
    } else {
      setApiKeyError(null);
    }
  };

  // Verify API key by calling the backend endpoint (avoids CORS issues)
  const verifyApiKey = async (provider: string, apiKey: string): Promise<{ valid: boolean; error?: string }> => {
    return verifyLlmApiKey(provider, apiKey);
  };

  // State for verification
  const [verifyingApiKey, setVerifyingApiKey] = useState(false);

  // Handle API key modal submission
  const handleAddApiKey = async () => {
    if (!selectedProvider || !newApiKey.trim()) {
      setApiKeyAlert({
        variant: "error",
        body: "Please select a provider and enter an API key",
      });
      setTimeout(() => setApiKeyAlert(null), 5000);
      return;
    }

    // Validate API key format before submission
    const formatError = validateApiKeyFormat(selectedProvider, newApiKey);
    if (formatError) {
      setApiKeyError(formatError);
      setApiKeyAlert({
        variant: "error",
        body: formatError,
      });
      setTimeout(() => setApiKeyAlert(null), 5000);
      return;
    }

    // Verify the API key actually works
    setVerifyingApiKey(true);
    setApiKeyAlert(null); // Clear any previous alerts

    const verification = await verifyApiKey(selectedProvider, newApiKey);
    setVerifyingApiKey(false);

    if (!verification.valid) {
      setApiKeyError(verification.error || "Invalid API key");
      setApiKeyAlert({
        variant: "error",
        body: verification.error || "Invalid API key - please check and try again",
      });
      setTimeout(() => setApiKeyAlert(null), 5000);
      return;
    }

    setApiKeySaving(true);

    try {
      await addLlmApiKey({
        provider: selectedProvider as LLMProvider,
        apiKey: newApiKey,
      });

      setApiKeyAlert({
        variant: "success",
        body: "API key verified and saved successfully",
      });
      // Refresh the keys list
      await fetchLlmApiKeys();
      setTimeout(() => {
        setApiKeyAlert(null);
        setApiKeyModalOpen(false);
        setSelectedProvider("");
        setNewApiKey("");
        setApiKeyError(null);
      }, 1500);
    } catch (err) {
      setApiKeyAlert({
        variant: "error",
        body: err instanceof Error ? err.message : "Failed to add API key",
      });
      setTimeout(() => setApiKeyAlert(null), 5000);
    } finally {
      setApiKeySaving(false);
    }
  };

  // Build breadcrumbs based on current view
  // Note: /evals breadcrumbs start with "LLM Evals" (not Dashboard) to keep users in the Evals context
  const tabInfo = getTabInfo(tab);
  const breadcrumbItems =
    !orgId
      ? [
        {
          label: "LLM Evals",
          path: "/evals",
          icon: <FlaskConical size={14} strokeWidth={1.5} />,
          onClick: async () => {
            // When in Organizations view with no org selected, choose first org so ProjectsList can render
            try {
              const { org } = await getCurrentOrg();
              if (!org) {
                const { orgs } = await getAllOrgs();
                if (orgs && orgs.length > 0) {
                  await setCurrentOrg(orgs[0].id);
                  setOrgId(orgs[0].id);
                }
              }
            } catch {
              // ignore
            }
            navigate("/evals");
          },
        },
        { label: tabInfo.label, icon: tabInfo.icon },
      ]
      : projectId && currentProject
        ? [
          { label: "LLM Evals", path: "/evals", icon: <FlaskConical size={14} strokeWidth={1.5} />, onClick: () => navigate("/evals") },
          { label: tabInfo.label, icon: tabInfo.icon },
        ]
        : [
          { label: "LLM Evals", path: "/evals", icon: <FlaskConical size={14} strokeWidth={1.5} />, onClick: () => navigate("/evals") },
          { label: tabInfo.label, icon: tabInfo.icon },
        ];

  return (
    <Stack className="vwhome" gap={"16px"}>
      <PageBreadcrumbs items={breadcrumbItems} sx={{ mb: 0, "& > hr": { mb: 0 } }} />

      {/* Server Connection Error Banner */}
      {serverConnectionError && (
        <Box
          sx={{
            p: 2,
            backgroundColor: palette.status.error.bg,
            borderRadius: "8px",
            border: `1px solid ${palette.status.error.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: palette.status.error.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography sx={{ fontSize: "16px" }}>⚠️</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: "14px", fontWeight: 600, color: palette.status.error.text }}>
                Unable to connect to the evaluation server
              </Typography>
              <Typography sx={{ fontSize: "13px", color: palette.status.error.text }}>
                Please make sure the backend server is running and try again.
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            size="small"
            onClick={handleRetryConnection}
            disabled={initialLoading}
            sx={{
              textTransform: "none",
              borderColor: palette.status.error.text,
              color: palette.status.error.text,
              "&:hover": { borderColor: palette.status.error.text, backgroundColor: palette.status.error.bg },
            }}
          >
            {initialLoading ? "Retrying..." : "Retry Connection"}
          </Button>
        </Box>
      )}

      {/* Main content */}
      <Box sx={{ flex: 1, margin: 0, padding: 0, minWidth: 0, overflow: "hidden" }}>
        {/* Show nothing while initially loading to prevent flash */}
        {initialLoading && !projectId ? null : (
          /* Settings tab - always available regardless of project selection */
          tab === "settings" ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
              <PageHeader
                title="Settings"
                description="Manage your organization's LLM provider API keys. These keys are shared across all projects."
              />

              {/* LLM API Keys Card */}
              <Box
                sx={{
                  background: palette.background.main,
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: "20px 24px",
                  boxShadow: "none",
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 600, fontSize: 13, color: palette.text.secondary }}>
                      Provider API keys
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mt: 0.5 }}>
                      Encrypted keys for running evaluations across all projects
                    </Typography>
                  </Box>
                  {llmApiKeys.length > 0 && (
                    <CustomizableButton
                      variant="contained"
                      text="Add API key"
                      icon={<PlusIcon size={16} />}
                      onClick={() => {
                        setIsEditingApiKey(false);
                        setApiKeyModalOpen(true);
                      }}
                      isDisabled={!canManageApiKeys}
                      sx={{
                        backgroundColor: palette.brand.primary,
                        color: palette.background.main,
                        "&:hover": { backgroundColor: palette.brand.primaryHover },
                      }}
                    />
                  )}
                </Box>

                {llmApiKeysLoading && llmApiKeys.length === 0 ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : llmApiKeys.length === 0 ? (
                  <Box
                    sx={{
                      border: `2px dashed ${palette.border.dark}`,
                      borderRadius: "12px",
                      p: 6,
                      textAlign: "center",
                      backgroundColor: palette.background.accent,
                    }}
                  >
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        backgroundColor: palette.status.success.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto",
                        mb: 2,
                      }}
                    >
                      <PlusIcon size={24} color={palette.brand.primary} />
                    </Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 600, color: palette.text.primary, mb: 1 }}>
                      No API keys yet
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: palette.text.tertiary, mb: 3 }}>
                      {canManageApiKeys ? "Add your first API key to enable LLM evaluations" : "Contact an admin to add API keys"}
                    </Typography>
                    <CustomizableButton
                      variant="contained"
                      text="Add API key"
                      icon={<PlusIcon size={16} />}
                      onClick={() => {
                        setIsEditingApiKey(false);
                        setApiKeyModalOpen(true);
                      }}
                      isDisabled={!canManageApiKeys}
                      sx={{
                        backgroundColor: palette.brand.primary,
                        color: palette.background.main,
                        "&:hover": { backgroundColor: palette.brand.primaryHover },
                      }}
                    />
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {llmApiKeys.map((key) => {
                      const providerConfig = LLM_PROVIDERS.find(p => p._id === key.provider);
                      const ProviderLogo = providerConfig?.Logo;
                      return (
                        <Collapse
                          key={key.provider}
                          in={deletingKeyProvider !== key.provider}
                          timeout={300}
                        >
                          <Box
                            sx={{
                              border: `1.5px solid ${palette.border.light}`,
                              borderRadius: "4px",
                              p: 2,
                              pl: 2.5,
                              backgroundColor: palette.background.main,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              cursor: "default",
                              opacity: deletingKeyProvider === key.provider ? 0 : 1,
                              transform: deletingKeyProvider === key.provider ? "translateY(-20px)" : "translateY(0)",
                              transition: "opacity 0.3s ease, transform 0.3s ease",
                            }}
                          >
                            <Stack direction="row" alignItems="center" spacing={2.5} sx={{ flex: 1 }}>
                              {/* Provider Logo */}
                              <Box
                                sx={{
                                  width: 56,
                                  height: 56,
                                  minWidth: 56,
                                  minHeight: 56,
                                  borderRadius: "12px",
                                  backgroundColor: palette.background.accent,
                                  border: `1px solid ${palette.border.dark}`,
                                  flexShrink: 0,
                                  overflow: "hidden",
                                  position: "relative",
                                }}
                              >
                                <Box
                                  sx={{
                                    position: "absolute",
                                    top: "50%",
                                    left: "50%",
                                    transform: "translate(-50%, -50%)",
                                    width: 32,
                                    height: 32,
                                    "& svg": {
                                      width: "32px !important",
                                      height: "32px !important",
                                      maxWidth: "32px !important",
                                      maxHeight: "32px !important",
                                      display: "block !important",
                                    },
                                  }}
                                >
                                  {ProviderLogo && <ProviderLogo />}
                                </Box>
                              </Box>

                              {/* Provider Info - Better formatted */}
                              <Box sx={{ flex: 1 }}>
                                <Stack direction="row" alignItems="center" sx={{ mb: 1.5, gap: "10px" }}>
                                  <Typography sx={{
                                    fontSize: 15,
                                    fontWeight: 600,
                                    color: palette.text.primary,
                                  }}>
                                    {getProviderDisplayName(key.provider)}
                                  </Typography>
                                  <VWChip label="Active" variant="success" size="small" />
                                </Stack>
                                <Stack direction="row" alignItems="center" sx={{ gap: "48px" }}>
                                  <Box>
                                    <Typography sx={{ fontSize: 11, color: palette.text.disabled, mb: 0.5 }}>API Key</Typography>
                                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.secondary, fontFamily: "monospace" }}>
                                      {key.maskedKey}
                                    </Typography>
                                  </Box>
                                  <Box>
                                    <Typography sx={{ fontSize: 11, color: palette.text.disabled, mb: 0.5 }}>Added</Typography>
                                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: palette.text.secondary }}>
                                      {formatKeyDate(key.createdAt)}
                                    </Typography>
                                  </Box>
                                </Stack>
                              </Box>
                            </Stack>

                            {/* Action buttons */}
                            <Stack direction="row" spacing={1} alignItems="center">
                              <IconButton
                                onClick={() => {
                                  setIsEditingApiKey(true);
                                  setSelectedProvider(key.provider);
                                  setNewApiKey("");
                                  setApiKeyModalOpen(true);
                                }}
                                disabled={!canManageApiKeys}
                                sx={{
                                  color: palette.text.tertiary,
                                  padding: "8px",
                                  "&:hover": {
                                    backgroundColor: palette.background.hover,
                                    color: palette.text.secondary,
                                  },
                                  "&.Mui-disabled": {
                                    color: palette.border.dark,
                                  },
                                }}
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </IconButton>
                              <IconButton
                                onClick={() => {
                                  setKeyToDelete(key);
                                  setDeleteKeyModalOpen(true);
                                }}
                                disabled={!canManageApiKeys}
                                sx={{
                                  color: palette.status.error.text,
                                  padding: "8px",
                                  "&:hover": {
                                    backgroundColor: palette.status.error.bg,
                                    color: palette.status.error.text,
                                  },
                                  "&.Mui-disabled": {
                                    color: palette.border.dark,
                                  },
                                }}
                              >
                                <DeleteIcon size={18} />
                              </IconButton>
                            </Stack>
                          </Box>
                        </Collapse>
                      );
                    })}
                  </Box>
                )}
              </Box>

              {/* Local Providers Section */}
              <Box
                sx={{
                  background: palette.background.main,
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: "20px 24px",
                  boxShadow: "none",
                  mt: 3,
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3, gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14, color: palette.text.secondary, mb: 0.5 }}>
                      Local providers
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: palette.text.tertiary, lineHeight: 1.5 }}>
                      Run models locally without API keys. These will appear as options when creating a new experiment.
                    </Typography>
                  </Box>
                  {!ENV_VARs.IS_DEMO_APP && (
                    <CustomizableButton
                      variant="contained"
                      text="Add provider"
                      icon={<PlusIcon size={16} />}
                      onClick={() => setLocalProviderModalOpen(true)}
                      sx={{
                        backgroundColor: palette.brand.primary,
                        color: palette.background.main,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        "&:hover": { backgroundColor: palette.brand.primaryHover },
                      }}
                    />
                  )}
                </Box>

                {ENV_VARs.IS_DEMO_APP ? (
                  <Box
                    sx={{
                      border: `1px solid ${palette.accent.indigo.border}`,
                      borderRadius: "8px",
                      p: 3,
                      backgroundColor: palette.accent.indigo.bg,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 2,
                    }}
                  >
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        backgroundColor: palette.accent.indigo.border,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <OllamaLogo style={{ width: 18, height: 18 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 14, fontWeight: 600, color: palette.accent.indigo.text, mb: 0.5 }}>
                        Local providers are only available for self-hosted deployments
                      </Typography>
                      <Typography sx={{ fontSize: 13, color: palette.accent.indigo.text, lineHeight: 1.5 }}>
                        To use Ollama or other local models, deploy VerifyWise on your own infrastructure.
                        Local providers require direct access to your machine's network which isn't possible on the hosted demo.
                      </Typography>
                    </Box>
                  </Box>
                ) : localProviders.length === 0 ? (
                  <Box
                    sx={{
                      border: `2px dashed ${palette.border.dark}`,
                      borderRadius: "12px",
                      p: 5,
                      textAlign: "center",
                      backgroundColor: palette.background.accent,
                    }}
                  >
                    <Typography sx={{ fontSize: 14, fontWeight: 500, color: palette.text.tertiary }}>
                      No local providers configured yet
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: palette.text.disabled, mt: 0.5 }}>
                      Click "Add local provider" to get started
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {localProviders.map((provider) => (
                      <Collapse
                        key={provider.id}
                        in={deletingLocalProviderId !== provider.id}
                        timeout={300}
                      >
                        <Box
                          sx={{
                            border: `1.5px solid ${palette.border.light}`,
                            borderRadius: "4px",
                            p: 2,
                            pl: 2.5,
                            backgroundColor: palette.background.main,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Stack direction="row" alignItems="center" spacing={2.5} sx={{ flex: 1 }}>
                            <Box
                              sx={{
                                width: 56,
                                height: 56,
                                minWidth: 56,
                                borderRadius: "12px",
                                backgroundColor: palette.background.accent,
                                border: `1px solid ${palette.border.dark}`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Box sx={{ width: 32, height: 32, "& svg": { width: "32px !important", height: "32px !important" } }}>
                                {provider.type === "ollama" ? <OllamaLogo /> : <FolderFilledIcon />}
                              </Box>
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Stack direction="row" alignItems="center" sx={{ mb: 0.5, gap: "10px" }}>
                                <Typography sx={{ fontSize: 15, fontWeight: 600, color: palette.text.primary }}>
                                  {provider.name}
                                </Typography>
                                <VWChip
                                  label={provider.type === "ollama" ? "Ollama" : "Local"}
                                  size="small"
                                  backgroundColor={provider.type === "ollama" ? palette.accent.blue.bg : palette.accent.purple.bg}
                                  textColor={provider.type === "ollama" ? palette.accent.blue.text : palette.accent.purple.text}
                                />
                              </Stack>
                              <Typography sx={{ fontSize: 12, color: palette.text.tertiary, fontFamily: "monospace" }}>
                                {provider.url}
                              </Typography>
                            </Box>
                          </Stack>
                          <IconButton
                            onClick={() => handleDeleteLocalProvider(provider.id)}
                            sx={{
                              color: palette.status.error.text,
                              padding: "8px",
                              "&:hover": {
                                backgroundColor: palette.status.error.bg,
                                color: palette.status.error.text,
                              },
                            }}
                          >
                            <DeleteIcon size={18} />
                          </IconButton>
                        </Box>
                      </Collapse>
                    ))}
                  </Box>
                )}

              </Box>
            </Box>
          ) : !projectId ? (
            /* No project selected - show projects list */
            <ProjectsList />
          ) : (
            /* Project selected - show tab content */
            <>
              {tab === "overview" && (
                <ProjectOverview
                  projectId={projectId}
                  orgId={orgId}
                  project={currentProject}
                  onProjectUpdate={setCurrentProject}
                  onViewExperiment={(experimentId) => {
                    setSelectedExperimentId(experimentId);
                    setTab("experiments");
                    navigate(`${location.pathname}#experiments`);
                  }}
                />
              )}

              {tab === "experiments" && (
                selectedExperimentId ? (
                  <ExperimentDetailContent
                    experimentId={selectedExperimentId}
                    projectId={projectId || ""}
                    onBack={() => setSelectedExperimentId(null)}
                  />
                ) : currentProject ? (
                  <ProjectExperiments
                    projectId={projectId}
                    orgId={orgId}
                    onViewExperiment={(experimentId) => setSelectedExperimentId(experimentId)}
                    useCase={(currentProject.useCase || "chatbot") as "chatbot" | "rag" | "agent"}
                  />
                ) : null
              )}

              {tab === "datasets" && (
                <ProjectDatasets projectId={projectId} orgId={orgId || currentProject?.orgId || ""} />
              )}

              {tab === "scorers" && projectId && (
                <ProjectScorers projectId={projectId} orgId={orgId || currentProject?.orgId || ""} />
              )}

              {tab === "models" && (
                <ModelsPage orgId={orgId || currentProject?.orgId || ""} />
              )}

              {tab === "arena" && (
                <ArenaPage orgId={orgId || currentProject?.orgId || ""} />
              )}

              {tab === "bias-audits" && (
                selectedBiasAuditId ? (
                  <BiasAuditDetail auditId={selectedBiasAuditId} onBack={() => setSelectedBiasAuditId(null)} />
                ) : (
                  <BiasAuditsList orgId={orgId || currentProject?.orgId || ""} onViewAudit={(id) => setSelectedBiasAuditId(id)} />
                )
              )}

              {tab === "reports" && (
                <ReportPage
                  projectId={projectId}
                  projectName={currentProject?.name || ""}
                  orgId={orgId || currentProject?.orgId || ""}
                />
              )}

              {tab === "configuration" && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                  <PageHeader
                    title="Configuration"
                    description="Configure your project's LLM use case for running evaluations."
                  />

                  {/* LLM Use Case Card */}
                  <Box
                    sx={{
                      background: palette.background.main,
                      border: `1px solid ${palette.border.dark}`,
                      borderRadius: "4px",
                      p: "20px 24px",
                      boxShadow: "none",
                    }}
                  >
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
                      <Typography sx={{ fontWeight: 600, fontSize: 16, color: palette.text.secondary }}>
                        LLM use case
                      </Typography>
                    </Stack>

                    {/* Locked notice when experiments exist */}
                    {experimentsCount > 0 && (
                      <Box
                        sx={{
                          backgroundColor: palette.status.warning.bg,
                          border: `1px solid ${palette.status.warning.border}`,
                          borderRadius: "6px",
                          p: "8px",
                          mb: 3,
                        }}
                      >
                        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                          <Box>
                            <Typography sx={{ fontSize: "13px", fontWeight: 600, color: palette.status.warning.text, mb: 0.5 }}>
                              Use case is locked
                            </Typography>
                            <Typography sx={{ fontSize: "12px", color: palette.status.warning.text, lineHeight: 1.5 }}>
                              This project has {experimentsCount} experiment{experimentsCount !== 1 ? "s" : ""}.
                              To evaluate a different use case, create a new project.
                            </Typography>
                          </Box>
                          <CustomizableButton
                            variant="contained"
                            onClick={() => setCreateProjectModalOpen(true)}
                            icon={<PlusIcon size={14} />}
                            text="Create new project"
                            sx={{
                              backgroundColor: palette.brand.primary,
                              border: `1px solid ${palette.brand.primary}`,
                              gap: 2,
                              whiteSpace: "nowrap",
                              "&:hover": {
                                backgroundColor: palette.brand.primaryHover,
                              },
                            }}
                          />
                        </Stack>
                      </Box>
                    )}

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "220px 1fr",
                        rowGap: "20px",
                        columnGap: "80px",
                        alignItems: "flex-start",
                      }}
                    >
                      {/* Use Case Row */}
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>Use case type</Typography>
                        <Typography sx={{ fontSize: 12, color: palette.text.accent }}>
                          {experimentsCount > 0
                            ? "Use case cannot be changed after experiments are created"
                            : "Select the type of LLM application you want to evaluate"
                          }
                        </Typography>
                      </Box>
                      <RadioGroup
                        value={currentProject?.useCase || "chatbot"}
                        onChange={(e) => {
                          if (currentProject && experimentsCount === 0) {
                            setCurrentProject({ ...currentProject, useCase: e.target.value as "rag" | "chatbot" | "agent" });
                          }
                        }}
                      >
                        <FormControlLabel
                          value="rag"
                          disabled={experimentsCount > 0}
                          control={
                            <Radio
                              sx={{
                                color: palette.border.dark,
                                "&.Mui-checked": { color: palette.brand.primary },
                                "&.Mui-disabled": { color: palette.border.dark },
                                "& .MuiSvgIcon-root": { fontSize: 20 },
                              }}
                            />
                          }
                          label={
                            <Box sx={{ opacity: experimentsCount > 0 ? 0.6 : 1 }}>
                              <Typography sx={{ fontWeight: 600, fontSize: "13px" }}>RAG</Typography>
                              <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                                Evaluate retrieval-augmented generation, including recall, precision, relevancy and faithfulness.
                              </Typography>
                            </Box>
                          }
                          sx={{ alignItems: "flex-start", mb: 1.5 }}
                        />
                        <FormControlLabel
                          value="chatbot"
                          disabled={experimentsCount > 0}
                          control={
                            <Radio
                              sx={{
                                color: palette.border.dark,
                                "&.Mui-checked": { color: palette.brand.primary },
                                "&.Mui-disabled": { color: palette.border.dark },
                                "& .MuiSvgIcon-root": { fontSize: 20 },
                              }}
                            />
                          }
                          label={
                            <Box sx={{ opacity: experimentsCount > 0 ? 0.6 : 1 }}>
                              <Typography sx={{ fontWeight: 600, fontSize: "13px" }}>Chatbot</Typography>
                              <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                                Evaluate single and multi-turn conversational experiences for coherence, correctness and safety.
                              </Typography>
                            </Box>
                          }
                          sx={{ alignItems: "flex-start", mb: 1.5 }}
                        />
                        <FormControlLabel
                          value="agent"
                          disabled={experimentsCount > 0}
                          control={
                            <Radio
                              sx={{
                                color: palette.border.dark,
                                "&.Mui-checked": { color: palette.brand.primary },
                                "&.Mui-disabled": { color: palette.border.dark },
                                "& .MuiSvgIcon-root": { fontSize: 20 },
                              }}
                            />
                          }
                          label={
                            <Box sx={{ opacity: experimentsCount > 0 ? 0.6 : 1 }}>
                              <Typography sx={{ fontWeight: 600, fontSize: "13px" }}>Agent</Typography>
                              <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                                Evaluate AI agents for planning, tool usage, task completion, and step efficiency.
                              </Typography>
                            </Box>
                          }
                          sx={{ alignItems: "flex-start" }}
                        />
                      </RadioGroup>
                    </Box>
                  </Box>

                  {/* Config Alert */}
                  {configAlert && (
                    <Alert variant={configAlert.variant} body={configAlert.body} />
                  )}

                  {/* Save Button - only show when use case is not locked */}
                  {experimentsCount === 0 && (
                    <Stack>
                      <CustomizableButton
                        sx={{
                          alignSelf: "flex-end",
                          width: "fit-content",
                          gap: 2,
                          backgroundColor: hasUseCaseChanged ? palette.brand.primary : palette.border.dark,
                          border: hasUseCaseChanged ? `1px solid ${palette.brand.primary}` : `1px solid ${palette.border.dark}`,
                          "&:hover": hasUseCaseChanged ? { backgroundColor: palette.brand.primaryHover } : {},
                        }}
                        icon={<Save size={16} />}
                        variant="contained"
                        onClick={handleSaveConfiguration}
                        isDisabled={!hasUseCaseChanged || savingConfig}
                        loading={savingConfig}
                        text={savingConfig ? "Saving..." : "Save changes"}
                      />
                    </Stack>
                  )}
                </Box>
              )}

            </>
          ))}
      </Box>

      {/* Create Project Modal */}
      <ModalStandard
        isOpen={createProjectModalOpen}
        onClose={() => {
          setCreateProjectModalOpen(false);
          setNewProject({ name: "", description: "", useCase: "chatbot" });
          setCreateProjectError(null);
        }}
        title="Create project"
        description="Create a new project to organize your LLM evaluations"
        onSubmit={handleCreateProject}
        submitButtonText="Create project"
        isSubmitting={loading || !newProject.name}
      >
        <Stack spacing={3}>
          {createProjectError && (
            <Alert variant="error" body={createProjectError} />
          )}

          <Field
            label="Project name"
            value={newProject.name}
            onChange={(e) => {
              setNewProject({ ...newProject, name: e.target.value });
              setCreateProjectError(null); // Clear error when user starts typing
            }}
            placeholder="e.g., Coding Tasks Evaluation"
            isRequired
          />

          {/* LLM Use Case - card selection */}
          <Box>
            <Box sx={{ fontSize: "12px", color: palette.text.secondary, mb: 1.5, fontWeight: 600 }}>
              LLM use case
            </Box>
            <Stack spacing="8px">
              <SelectableCard
                isSelected={newProject.useCase === "rag"}
                onClick={() => setNewProject({ ...newProject, useCase: "rag" })}
                icon={<FileSearch size={14} color={newProject.useCase === "rag" ? palette.brand.primary : palette.text.disabled} />}
                title="RAG"
                description="Evaluate retrieval-augmented generation: recall, precision, relevancy and faithfulness"
              />
              <SelectableCard
                isSelected={newProject.useCase === "chatbot"}
                onClick={() => setNewProject({ ...newProject, useCase: "chatbot" })}
                icon={<Bot size={14} color={newProject.useCase === "chatbot" ? palette.brand.primary : palette.text.disabled} />}
                title="Chatbot"
                description="Evaluate conversational experiences for coherence, correctness and safety"
              />
              <SelectableCard
                isSelected={newProject.useCase === "agent"}
                onClick={() => setNewProject({ ...newProject, useCase: "agent" })}
                icon={<Workflow size={14} color={newProject.useCase === "agent" ? palette.brand.primary : palette.text.disabled} />}
                title="Agent"
                description="Evaluate AI agents for planning, tool usage, and task completion"
              />
            </Stack>
          </Box>
        </Stack>
      </ModalStandard>

      {/* Onboarding Modal: Create First Project (org is auto-created) */}
      <ModalStandard
        isOpen={onboardingStep === "project"}
        onClose={handleSkipOnboarding}
        title="Create your first project"
        description="Projects help you organize your LLM evaluations. Each project can have its own datasets, experiments, and configurations."
        onSubmit={handleOnboardingCreateProject}
        submitButtonText="Create project"
        isSubmitting={onboardingSubmitting || !onboardingProjectName.trim()}
      >
        <Stack spacing="8px">
          <Field
            label="Project name"
            value={onboardingProjectName}
            onChange={(e) => setOnboardingProjectName(e.target.value)}
            placeholder="e.g., Coding Tasks Evaluation"
            isRequired
          />

          {/* LLM Use Case - card selection */}
          <Box>
            <Box sx={{ fontSize: "12px", color: palette.text.secondary, mb: "8px", fontWeight: 600 }}>
              LLM use case
            </Box>
            <Stack spacing="8px">
              <SelectableCard
                isSelected={onboardingProjectUseCase === "rag"}
                onClick={() => setOnboardingProjectUseCase("rag")}
                icon={<FileSearch size={16} color={onboardingProjectUseCase === "rag" ? palette.brand.primary : palette.text.disabled} />}
                title="RAG"
                description="Evaluate retrieval-augmented generation"
              />
              <SelectableCard
                isSelected={onboardingProjectUseCase === "chatbot"}
                onClick={() => setOnboardingProjectUseCase("chatbot")}
                icon={<Bot size={16} color={onboardingProjectUseCase === "chatbot" ? palette.brand.primary : palette.text.disabled} />}
                title="Chatbot"
                description="Evaluate conversational experiences"
              />
              <SelectableCard
                isSelected={onboardingProjectUseCase === "agent"}
                onClick={() => setOnboardingProjectUseCase("agent")}
                icon={<Workflow size={16} color={onboardingProjectUseCase === "agent" ? palette.brand.primary : palette.text.disabled} />}
                title="Agent"
                description="Evaluate AI agents for planning and tool usage"
              />
            </Stack>
          </Box>
        </Stack>
      </ModalStandard>

      {/* Add/Edit API Key Modal - Using ModalStandard like experiment creation */}
      <ModalStandard
        isOpen={apiKeyModalOpen}
        onClose={() => {
          setApiKeyModalOpen(false);
          setIsEditingApiKey(false);
          setSelectedProvider("");
          setNewApiKey("");
          setApiKeyError(null);
          setApiKeyAlert(null);
        }}
        title={isEditingApiKey ? "Edit API key" : "Add API key"}
        description={isEditingApiKey
          ? `Update the API key for ${LLM_PROVIDERS.find(p => p._id === selectedProvider)?.name || selectedProvider}. Your keys are encrypted and stored securely.`
          : "Configure API keys for LLM providers to run evaluations. Your keys are encrypted and stored securely."
        }
        onSubmit={handleAddApiKey}
        submitButtonText={verifyingApiKey ? "Verifying..." : apiKeySaving ? "Saving..." : isEditingApiKey ? "Update API key" : "Add API key"}
        isSubmitting={verifyingApiKey || apiKeySaving || !selectedProvider || !newApiKey.trim() || !!apiKeyError}
      >
        <Stack spacing={3}>
          {/* Provider Selection Grid - show ALL providers (hidden when editing) */}
          {!isEditingApiKey && (
          <Box>
            <Typography sx={{ mb: 2, fontSize: "14px", fontWeight: 500, color: palette.text.secondary }}>
              Select Provider
            </Typography>
            <Grid container spacing={1.5}>
              {LLM_PROVIDERS.map((provider) => {
                const { Logo } = provider;
                const isSelected = selectedProvider === provider._id;
                const hasKey = llmApiKeys.some(k => k.provider === provider._id);

                return (
                  <Grid size={{ xs: 4, sm: 4 }} key={provider._id}>
                    <Card
                      onClick={() => handleProviderSelect(provider._id)}
                      sx={{
                        cursor: "pointer",
                        border: "1px solid",
                        borderColor: isSelected ? palette.brand.primary : palette.border.dark,
                        backgroundColor: palette.background.main,
                        boxShadow: "none",
                        transition: "all 0.2s ease",
                        position: "relative",
                        height: "100%",
                        "&:hover": {
                          borderColor: palette.brand.primary,
                          boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                        },
                      }}
                    >
                      <CardContent
                        sx={{
                          textAlign: "center",
                          py: 3,
                          px: 2,
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          "&:last-child": { pb: 3 },
                        }}
                      >
                        {isSelected && (
                          <Box
                            sx={{
                              position: "absolute",
                              top: 8,
                              right: 8,
                              backgroundColor: palette.brand.primary,
                              borderRadius: "50%",
                              width: 20,
                              height: 20,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Check size={12} color={palette.background.main} strokeWidth={3} />
                          </Box>
                        )}

                        {/* Configured badge */}
                        {hasKey && !isSelected && (
                          <Box
                            sx={{
                              position: "absolute",
                              top: 6,
                              left: 6,
                              backgroundColor: palette.status.success.bg,
                              borderRadius: "4px",
                              px: 0.75,
                              py: 0.25,
                            }}
                          >
                            <Typography sx={{ fontSize: "9px", fontWeight: 600, color: palette.status.success.text, textTransform: "uppercase" }}>
                              Active
                            </Typography>
                          </Box>
                        )}

                        {/* Provider Logo */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 40,
                            height: 40,
                            mb: 1.5,
                            "& svg": {
                              width: 32,
                              height: 32,
                            },
                          }}
                        >
                          <Logo />
                        </Box>

                        {/* Provider Name */}
                        <Typography
                          sx={{
                            fontSize: "12px",
                            fontWeight: isSelected ? 600 : 500,
                            color: isSelected ? palette.brand.primary : palette.text.secondary,
                            textAlign: "center",
                          }}
                        >
                          {provider.name}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
          )}

          {/* API Key Input */}
          {selectedProvider && (
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: "13px", fontWeight: 500, color: palette.text.secondary }}>
                  API key for {LLM_PROVIDERS.find(p => p._id === selectedProvider)?.name}
                </Typography>
                {llmApiKeys.some(k => k.provider === selectedProvider) && (
                  <Typography sx={{ fontSize: "11px", color: palette.text.tertiary }}>
                    This will replace the existing key
                  </Typography>
                )}
              </Stack>
              <Field
                label=""
                value={newApiKey}
                onChange={(e) => handleApiKeyInputChange(e.target.value)}
                placeholder={`Enter your ${LLM_PROVIDERS.find(p => p._id === selectedProvider)?.name || ''} API key...`}
                type="password"
                autoComplete="one-time-code"
                error={apiKeyError || ""}
              />
              {selectedProvider && !apiKeyError && newApiKey.trim() && (
                <Typography
                  sx={{
                    fontSize: 11,
                    color: palette.status.success.text,
                    mt: 0.5,
                    ml: 0.5,
                  }}
                >
                  ✓ Key format looks valid
                </Typography>
              )}
              {selectedProvider && !newApiKey.trim() && API_KEY_PATTERNS[selectedProvider] && (
                <>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: palette.text.tertiary,
                      mt: 0.5,
                      ml: 0.5,
                    }}
                  >
                    Expected format: {API_KEY_PATTERNS[selectedProvider]?.example}
                  </Typography>
                  {selectedProvider === "custom" && (
                    <Box
                      sx={{
                        mt: 2,
                        p: 2,
                        backgroundColor: palette.background.accent,
                        border: `1px solid ${palette.border.light}`,
                        borderRadius: "8px",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: palette.text.secondary,
                          mb: 1,
                        }}
                      >
                        API Compatibility
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: palette.text.tertiary,
                          lineHeight: 1.5,
                        }}
                      >
                        Your endpoint must be OpenAI-compatible, accepting{" "}
                        <Box component="span" sx={{ fontFamily: "monospace", backgroundColor: palette.border.light, px: 0.5, borderRadius: "3px", fontSize: 11 }}>
                          POST /v1/chat/completions
                        </Box>
                      </Typography>
                    </Box>
                  )}
                </>
              )}
            </Box>
          )}

          {apiKeyAlert && (
            <Alert variant={apiKeyAlert.variant} body={apiKeyAlert.body} />
          )}
        </Stack>
      </ModalStandard>

      {/* Delete LLM API Key Modal */}
      {deleteKeyModalOpen && keyToDelete && (
        <ConfirmationModal
          title="Delete API key"
          body={
            <Typography fontSize={13}>
              Are you sure you want to delete the {getProviderDisplayName(keyToDelete.provider)} API key? Any evaluations using this key will no longer be able to run.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Delete"
          onCancel={() => {
            setDeleteKeyModalOpen(false);
            setKeyToDelete(null);
          }}
          onProceed={handleDeleteLlmKey}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          TitleFontSize={0}
        />
      )}

      {/* Add Local Provider Modal */}
      <ModalStandard
        isOpen={localProviderModalOpen}
        onClose={() => {
          setLocalProviderModalOpen(false);
          setSelectedLocalProviderType("");
          setLocalProviderName("");
          setLocalProviderUrl("");
        }}
        title="Add local provider"
        description="Configure a local model provider. No API key required."
        onSubmit={handleAddLocalProvider}
        submitButtonText={localProviderSaving ? "Adding..." : "Add provider"}
        isSubmitting={localProviderSaving || !selectedLocalProviderType || !localProviderUrl.trim()}
      >
        <Stack spacing={3}>
          {/* Provider Type Selection */}
          <Box>
            <Typography sx={{ mb: 2, fontSize: "14px", fontWeight: 500, color: palette.text.secondary }}>
              Select provider type
            </Typography>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              {/* Ollama */}
              <Card
                onClick={() => {
                  setSelectedLocalProviderType("ollama");
                  setLocalProviderName("llama3.2");
                  setLocalProviderUrl("http://localhost:11434");
                }}
                sx={{
                  flex: 1,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: selectedLocalProviderType === "ollama" ? palette.brand.primary : palette.border.dark,
                  backgroundColor: palette.background.main,
                  boxShadow: "none",
                  transition: "all 0.2s ease",
                  position: "relative",
                  "&:hover": {
                    borderColor: palette.brand.primary,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                  },
                }}
              >
                <CardContent sx={{
                  textAlign: "center",
                  py: 3,
                  px: 2,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {selectedLocalProviderType === "ollama" && (
                    <Box
                      sx={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        backgroundColor: palette.brand.primary,
                        borderRadius: "50%",
                        width: 20,
                        height: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={12} color={palette.background.main} strokeWidth={3} />
                    </Box>
                  )}
                  <Box sx={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", mb: 1.5 }}>
                    <OllamaLogo />
                  </Box>
                  <Typography sx={{ fontSize: "13px", fontWeight: selectedLocalProviderType === "ollama" ? 600 : 500, color: selectedLocalProviderType === "ollama" ? palette.brand.primary : palette.text.secondary }}>
                    Ollama
                  </Typography>
                </CardContent>
              </Card>

              {/* Local Endpoint */}
              <Card
                onClick={() => {
                  setSelectedLocalProviderType("local");
                  setLocalProviderName("Local Endpoint");
                  setLocalProviderUrl("http://localhost:8000/api/generate");
                }}
                sx={{
                  flex: 1,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: selectedLocalProviderType === "local" ? palette.brand.primary : palette.border.dark,
                  backgroundColor: palette.background.main,
                  boxShadow: "none",
                  transition: "all 0.2s ease",
                  position: "relative",
                  "&:hover": {
                    borderColor: palette.brand.primary,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                  },
                }}
              >
                <CardContent sx={{
                  textAlign: "center",
                  py: 3,
                  px: 2,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {selectedLocalProviderType === "local" && (
                    <Box
                      sx={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        backgroundColor: palette.brand.primary,
                        borderRadius: "50%",
                        width: 20,
                        height: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={12} color={palette.background.main} strokeWidth={3} />
                    </Box>
                  )}
                  <Box sx={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", mb: 1.5 }}>
                    <FolderFilledIcon />
                  </Box>
                  <Typography sx={{ fontSize: "13px", fontWeight: selectedLocalProviderType === "local" ? 600 : 500, color: selectedLocalProviderType === "local" ? palette.brand.primary : palette.text.secondary }}>
                    Local Endpoint
                  </Typography>
                </CardContent>
              </Card>
            </Box>
          </Box>

          {/* Configuration Fields */}
          {selectedLocalProviderType && (
            <>
              <Field
                label="Display name"
                value={localProviderName}
                onChange={(e) => setLocalProviderName(e.target.value)}
                placeholder={selectedLocalProviderType === "ollama" ? "llama3.2" : "My Local Server"}
              />
              <Box>
                <Field
                  label="Endpoint URL"
                  value={localProviderUrl}
                  onChange={(e) => setLocalProviderUrl(e.target.value)}
                  placeholder={selectedLocalProviderType === "ollama" ? "http://localhost:11434" : "http://localhost:8000/api/generate"}
                  isRequired
                />
                {selectedLocalProviderType === "ollama" ? (
                  <Typography sx={{ fontSize: 11, color: palette.text.tertiary, mt: 0.5, ml: 0.5 }}>
                    Default Ollama endpoint is http://localhost:11434
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      mt: 2,
                      p: 2,
                      backgroundColor: palette.background.accent,
                      border: `1px solid ${palette.border.light}`,
                      borderRadius: "8px",
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: palette.text.secondary,
                        mb: 1,
                      }}
                    >
                      API Compatibility
                    </Typography>
                    <Typography
                      sx={{
                        fontSize: 12,
                        color: palette.text.tertiary,
                        lineHeight: 1.5,
                      }}
                    >
                      Your endpoint must be OpenAI-compatible, accepting{" "}
                      <Box component="span" sx={{ fontFamily: "monospace", backgroundColor: palette.border.light, px: 0.5, borderRadius: "3px", fontSize: 11 }}>
                        POST /v1/chat/completions
                      </Box>
                    </Typography>
                  </Box>
                )}
              </Box>
            </>
          )}
        </Stack>
      </ModalStandard>

      {/* Project action alert */}
      {projectActionAlert && (
        <Box sx={{ position: "fixed", top: 16, right: 16, zIndex: 9999 }}>
          <Alert variant={projectActionAlert.variant} body={projectActionAlert.body} />
        </Box>
      )}

      {/* API key alert */}
      {apiKeyAlert && (
        <Box sx={{ position: "fixed", top: 16, right: 16, zIndex: 9999 }}>
          <Alert variant={apiKeyAlert.variant} body={apiKeyAlert.body} />
        </Box>
      )}

      {/* Rename Project Modal */}
      <ModalStandard
        isOpen={renameModalOpen}
        onClose={() => {
          setRenameModalOpen(false);
          setRenameProjectId(null);
          setRenameProjectName("");
        }}
        title="Rename project"
        description="Enter a new name for this project."
        onSubmit={handleConfirmRename}
        submitButtonText="Rename"
        isSubmitting={renaming || !renameProjectName.trim()}
      >
        <Field
          label="Project name"
          value={renameProjectName}
          onChange={(e) => setRenameProjectName(e.target.value)}
          placeholder="Enter project name..."
          isRequired
        />
      </ModalStandard>

      {/* Delete Project Modal */}
      <ModalStandard
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteProjectId(null);
        }}
        title="Delete project"
        description="Are you sure you want to delete this project? This will permanently remove all experiments, datasets, and scorers associated with this project. This action cannot be undone."
        onSubmit={handleConfirmDelete}
        submitButtonText="Delete project"
        isSubmitting={deleting}
      >
        <Typography variant="body2" color="text.secondary">
          To confirm, you are about to delete the project:{" "}
          <strong>{allProjects.find((p) => p.id === deleteProjectId)?.name}</strong>
        </Typography>
      </ModalStandard>
    </Stack>
  );
}

