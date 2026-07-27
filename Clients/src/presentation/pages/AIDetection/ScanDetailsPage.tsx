/**
 * @fileoverview AI Detection Scan Details Page
 *
 * Page for viewing detailed scan results and findings.
 * Includes separate tabs for Libraries and Security findings.
 *
 * @module pages/AIDetection/ScanDetailsPage
 */

import { useState, useEffect, Suspense } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { TabContext } from "@mui/lab";
import {
  AlertCircle,
  AlertTriangle,
  Cpu,
  FileSearch,
  Info,
  Package,
  ShieldCheck,
} from "lucide-react";
import Alert from "../../components/Alert";
import { StatCard } from "../../components/Cards/StatCard";
import TabBar from "../../components/TabBar";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import {
  getScan,
  getScanFindings,
  getScanSecurityFindings,
  getScanSecuritySummary,
  exportAIBOM,
  getComplianceMapping,
  recalculateRiskScore,
} from "../../../application/repository/aiDetection.repository";
import Toggle from "../../components/Inputs/Toggle";
import {
  ScanResponse,
  ConfidenceLevel,
  SecuritySeverity,
  SecuritySummary,
  SecurityFinding,
  Finding,
  ComplianceMappingResponse,
} from "../../../domain/ai-detection/types";
import AIDepGraphModal from "../../components/AIDepGraphModal";
import { palette } from "../../themes/palette";
import { TabValue } from "./ScanDetails/scanDetailsConfig";
import { usePaginatedFindings } from "./ScanDetails/usePaginatedFindings";
import { ScanDetailsHeader } from "./ScanDetails/ScanDetailsHeader";
import { SuggestedRisksSection } from "./ScanDetails/SuggestedRisksSection";
import { FindingsTabPanel } from "./ScanDetails/FindingsTabPanel";
import { SecurityFindingsTab } from "./ScanDetails/SecurityFindingsTab";
import { ComplianceTab } from "./ScanDetails/ComplianceTab";
import { VulnerabilitiesTab } from "./ScanDetails/VulnerabilitiesTab";

// ============================================================================
// Main Component
// ============================================================================

export default function ScanDetailsPage() {
  const navigate = useNavigate();
  const { scanId: scanIdParam, tab } = useParams<{ scanId: string; tab?: string }>();
  const scanId = parseInt(scanIdParam || "0", 10);
  const initialTab: TabValue = (tab as TabValue) || "libraries";
  const [scan, setScan] = useState<ScanResponse | null>(null);

  // Paginated findings state (grouped by tab)
  const libraryState = usePaginatedFindings();
  const apiCallState = usePaginatedFindings();
  const secretState = usePaginatedFindings();
  const modelState = usePaginatedFindings();
  const ragState = usePaginatedFindings();
  const agentState = usePaginatedFindings();
  const securityState = usePaginatedFindings<SecurityFinding>();

  const [securitySummary, setSecuritySummary] = useState<SecuritySummary | null>(null);
  const [vulnerabilityFindings, setVulnerabilityFindings] = useState<Finding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);

  // Handle tab change with URL navigation
  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue as TabValue);
    navigate(`/ai-detection/scans/${scanId}/${newValue}`, { replace: true });
  };

  // Sync activeTab when initialTab changes (URL navigation)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceLevel | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SecuritySeverity | null>(null);
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDepGraph, setShowDepGraph] = useState(false);
  const [complianceData, setComplianceData] = useState<ComplianceMappingResponse | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Toast alert state
  const [alert, setAlert] = useState<{ variant: "success" | "error"; body: string } | null>(null);
  const showAlert = (variant: "success" | "error", body: string) => {
    setAlert({ variant, body });
    setTimeout(() => setAlert(null), 3000);
  };

  // Initial load - only loads scan data
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const [
          scanResponse,
          findingsResponse,
          apiCallFindingsResponse,
          secretFindingsResponse,
          modelFindingsResponse,
          ragFindingsResponse,
          agentFindingsResponse,
          securityFindingsResponse,
          summaryResponse,
          vulnFindingsResponses,
        ] = await Promise.all([
          getScan(scanId),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "library" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "api_call" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "secret" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "model_ref" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "rag_component" }),
          getScanFindings(scanId, { page: 1, limit: 50, finding_type: "agent" }),
          getScanSecurityFindings(scanId, { page: 1, limit: 50 }),
          getScanSecuritySummary(scanId),
          Promise.all([
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "prompt_injection" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "jailbreak_risk" }),
            getScanFindings(scanId, {
              page: 1,
              limit: 50,
              finding_type: "training_data_poisoning",
            }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "model_dos" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "supply_chain" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "pii_exposure" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "insecure_plugin" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "excessive_agency" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "overreliance" }),
            getScanFindings(scanId, { page: 1, limit: 50, finding_type: "model_theft" }),
          ]),
        ]);
        setScan(scanResponse);
        libraryState.setFindings(findingsResponse.findings);
        libraryState.setTotalPages(findingsResponse.pagination.total_pages);
        apiCallState.setFindings(apiCallFindingsResponse.findings);
        apiCallState.setTotalPages(apiCallFindingsResponse.pagination.total_pages);
        secretState.setFindings(secretFindingsResponse.findings);
        secretState.setTotalPages(secretFindingsResponse.pagination.total_pages);
        modelState.setFindings(modelFindingsResponse.findings);
        modelState.setTotalPages(modelFindingsResponse.pagination.total_pages);
        ragState.setFindings(ragFindingsResponse.findings);
        ragState.setTotalPages(ragFindingsResponse.pagination.total_pages);
        agentState.setFindings(agentFindingsResponse.findings);
        agentState.setTotalPages(agentFindingsResponse.pagination.total_pages);
        securityState.setFindings(securityFindingsResponse.findings);
        securityState.setTotalPages(securityFindingsResponse.pagination.total_pages);
        setSecuritySummary(summaryResponse);
        // Combine all vulnerability findings
        setVulnerabilityFindings(vulnFindingsResponses.flatMap((r) => r.findings));
      } catch {
        // Error loading scan - component will show empty state
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [scanId]);

  // Reload library findings when page or filter changes
  useEffect(() => {
    if (!scan) return;

    const loadLibraryFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: libraryState.page,
          limit: 50,
          confidence: confidenceFilter || undefined,
          finding_type: "library",
        });
        libraryState.setFindings(findingsResponse.findings);
        libraryState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadLibraryFindings();
  }, [scanId, libraryState.page, confidenceFilter, scan]);

  // Reload API call findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadApiCallFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: apiCallState.page,
          limit: 50,
          finding_type: "api_call",
        });
        apiCallState.setFindings(findingsResponse.findings);
        apiCallState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadApiCallFindings();
  }, [scanId, apiCallState.page, scan]);

  // Reload secret findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadSecretFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: secretState.page,
          limit: 50,
          finding_type: "secret",
        });
        secretState.setFindings(findingsResponse.findings);
        secretState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadSecretFindings();
  }, [scanId, secretState.page, scan]);

  // Reload model findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadModelFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: modelState.page,
          limit: 50,
          finding_type: "model_ref",
        });
        modelState.setFindings(findingsResponse.findings);
        modelState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadModelFindings();
  }, [scanId, modelState.page, scan]);

  // Reload RAG findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadRagFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: ragState.page,
          limit: 50,
          finding_type: "rag_component",
        });
        ragState.setFindings(findingsResponse.findings);
        ragState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadRagFindings();
  }, [scanId, ragState.page, scan]);

  // Reload agent findings when page changes
  useEffect(() => {
    if (!scan) return;

    const loadAgentFindings = async () => {
      try {
        const findingsResponse = await getScanFindings(scanId, {
          page: agentState.page,
          limit: 50,
          finding_type: "agent",
        });
        agentState.setFindings(findingsResponse.findings);
        agentState.setTotalPages(findingsResponse.pagination.total_pages);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadAgentFindings();
  }, [scanId, agentState.page, scan]);

  // Reload security findings when page or filter changes
  useEffect(() => {
    if (!scan) return;

    const loadSecurityFindings = async () => {
      try {
        const [findingsResponse, summaryResponse] = await Promise.all([
          getScanSecurityFindings(scanId, {
            page: securityState.page,
            limit: 50,
            severity: severityFilter || undefined,
          }),
          getScanSecuritySummary(scanId),
        ]);
        securityState.setFindings(findingsResponse.findings);
        securityState.setTotalPages(findingsResponse.pagination.total_pages);
        setSecuritySummary(summaryResponse);
      } catch {
        // Error loading findings - UI shows empty state
      }
    };

    loadSecurityFindings();
  }, [scanId, securityState.page, severityFilter, scan]);

  // Load compliance data when tab is selected (lazy loading)
  useEffect(() => {
    if (activeTab !== "compliance" || !scan || complianceData) return;

    const loadComplianceData = async () => {
      setComplianceLoading(true);
      try {
        const data = await getComplianceMapping(scanId);
        setComplianceData(data);
      } catch {
        // Error loading compliance data - UI shows empty state
      } finally {
        setComplianceLoading(false);
      }
    };

    loadComplianceData();
  }, [activeTab, scanId, scan, complianceData]);

  // Handle risk score recalculation
  const handleRecalculateRiskScore = async () => {
    if (!scan) return;
    setIsRecalculating(true);
    try {
      const result = await recalculateRiskScore(scanId);
      const updated = await getScan(scanId);
      setScan(updated);
      showAlert("success", `Risk score updated: ${result.score} (${result.grade})`);
    } catch {
      showAlert("error", "Failed to recalculate risk score");
    } finally {
      setIsRecalculating(false);
    }
  };

  // Handle AI-BOM export
  const handleExportAIBOM = async () => {
    if (!scan || isExporting) return;

    setIsExporting(true);
    try {
      const aiBomData = await exportAIBOM(scanId);

      // Create blob and download
      const blob = new Blob([JSON.stringify(aiBomData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ai-bom-${scan.scan.repository_owner}-${scan.scan.repository_name}-${scanId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showAlert("success", "AI-BOM exported successfully");
    } catch {
      showAlert("error", "Failed to export AI-BOM");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading && !scan) {
    return (
      <PageHeaderExtended title="Scan details">
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
            Loading scan details...
          </Typography>
        </Box>
      </PageHeaderExtended>
    );
  }

  if (!scan) {
    return (
      <PageHeaderExtended title="Scan details">
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: "13px", color: palette.status.error.text }}>
            Failed to load scan details
          </Typography>
        </Box>
      </PageHeaderExtended>
    );
  }

  return (
    <PageHeaderExtended
      title="Scan details"
      description={`${scan.scan.repository_owner}/${scan.scan.repository_name}`}
      alert={
        alert ? (
          <Suspense fallback={null}>
            <Alert
              variant={alert.variant}
              body={alert.body}
              isToast={true}
              onClick={() => setAlert(null)}
            />
          </Suspense>
        ) : undefined
      }
    >
      <ScanDetailsHeader
        scan={scan}
        onBack={() => navigate("/ai-detection/history")}
        isRecalculating={isRecalculating}
        onRecalculate={handleRecalculateRiskScore}
        isExporting={isExporting}
        onExport={handleExportAIBOM}
      />

      {/* Suggested Risks - only when LLM suggestions exist */}
      {scan.scan.status === "completed" &&
        scan.scan.risk_score_details?.llm_suggested_risks &&
        scan.scan.risk_score_details.llm_suggested_risks.length > 0 && (
          <SuggestedRisksSection
            suggestions={scan.scan.risk_score_details.llm_suggested_risks}
            onSuccess={() => showAlert("success", "Risk added to risk register")}
            onError={(message) => showAlert("error", message)}
          />
        )}

      {/* Tabs */}
      <TabContext value={activeTab}>
        <TabBar
          tabs={[
            {
              label: "Libraries",
              value: "libraries",
              icon: "Library",
              count: scan.summary.by_finding_type?.library || scan.summary.total,
              tooltip: "AI/ML libraries detected in this repository",
            },
            {
              label: "API calls",
              value: "api-calls",
              icon: "Globe",
              count: scan.summary.by_finding_type?.api_call || 0,
              tooltip: "External AI API calls found in the code",
            },
            {
              label: "Models",
              value: "models",
              icon: "Box",
              count: scan.summary.by_finding_type?.model_ref || 0,
              tooltip: "References to AI models in the codebase",
            },
            {
              label: "RAG",
              value: "rag",
              icon: "Database",
              count: scan.summary.by_finding_type?.rag_component || 0,
              tooltip: "Retrieval-augmented generation components",
            },
            {
              label: "Agents",
              value: "agents",
              icon: "Bot",
              count: scan.summary.by_finding_type?.agent || 0,
              tooltip: "Autonomous AI agent implementations",
            },
            {
              label: "Secrets",
              value: "secrets",
              icon: "Key",
              count: scan.summary.by_finding_type?.secret || 0,
              tooltip: "Exposed API keys and credentials",
            },
            {
              label: "Vulnerabilities",
              value: "vulnerabilities",
              icon: "ShieldAlert",
              count: vulnerabilityFindings.length,
              tooltip:
                "LLM-specific vulnerabilities (prompt injection, PII exposure, excessive agency, jailbreak risk)",
            },
            {
              label: "Security",
              value: "security",
              icon: "Shield",
              count: securitySummary?.total || 0,
              tooltip: "Security vulnerabilities in AI dependencies",
            },
            {
              label: "Compliance",
              value: "compliance",
              icon: "ClipboardCheck",
              count: complianceData?.checklist?.length || 0,
              tooltip: "Regulatory compliance checks and mappings",
            },
          ]}
          activeTab={activeTab}
          onChange={handleTabChange}
        />

        {/* Show suppressed toggle (applies to all tabs) */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 1,
            mt: "8px",
          }}
        >
          <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
            Show suppressed findings
          </Typography>
          <Toggle
            size="small"
            checked={showSuppressed}
            onChange={(_, checked) => setShowSuppressed(checked)}
            inputProps={{ "aria-label": "Show suppressed findings" }}
          />
        </Box>

        {/* Libraries Tab */}
        {activeTab === "libraries" && (
          <FindingsTabPanel
            description="AI and machine learning libraries detected in the repository. Click on a finding to see file locations."
            statCardsRow={
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "8px",
                  mb: "8px",
                }}
              >
                <StatCard
                  title="Total findings"
                  value={scan.summary.total}
                  Icon={Cpu}
                  active={confidenceFilter === null}
                  onClick={() => setConfidenceFilter(null)}
                  tooltip="Total AI/ML detections found in this scan"
                />
                <StatCard
                  title="High confidence"
                  value={scan.summary.by_confidence.high}
                  Icon={AlertCircle}
                  highlight={!confidenceFilter}
                  active={confidenceFilter === "high"}
                  onClick={() => setConfidenceFilter((f) => (f === "high" ? null : "high"))}
                  tooltip="Findings with high detection confidence"
                />
                <StatCard
                  title="Medium confidence"
                  value={scan.summary.by_confidence.medium}
                  Icon={AlertTriangle}
                  active={confidenceFilter === "medium"}
                  onClick={() => setConfidenceFilter((f) => (f === "medium" ? null : "medium"))}
                  tooltip="Findings with medium detection confidence"
                />
                <StatCard
                  title="Files scanned"
                  value={scan.scan.files_scanned}
                  Icon={FileSearch}
                  tooltip="Total number of source files analyzed"
                />
              </Box>
            }
            listHeading="Detected libraries"
            findings={libraryState.findings}
            showSuppressed={showSuppressed}
            scanId={scanId}
            repositoryOwner={scan.scan.repository_owner}
            repositoryName={scan.scan.repository_name}
            onStatusMessage={showAlert}
            emptyState={
              <Box
                sx={{
                  backgroundColor: palette.background.main,
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: 4,
                  textAlign: "center",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  {confidenceFilter
                    ? `No ${confidenceFilter} confidence findings`
                    : "No AI/ML libraries detected"}
                </Typography>
              </Box>
            }
            page={libraryState.page}
            totalPages={libraryState.totalPages}
            onPageChange={libraryState.setPage}
          />
        )}

        {/* API Calls Tab */}
        {activeTab === "api-calls" && (
          <FindingsTabPanel
            description="API calls to AI/ML services detected in the codebase. These represent active usage of AI models and services."
            summaryBox={{
              icon: Info,
              text: `${scan.summary.by_finding_type?.api_call || 0} API call${
                (scan.summary.by_finding_type?.api_call || 0) !== 1 ? "s" : ""
              } detected`,
              subtext:
                "All API call findings are marked as high confidence. These indicate direct integration with AI services.",
            }}
            findings={apiCallState.findings}
            showSuppressed={showSuppressed}
            scanId={scanId}
            repositoryOwner={scan.scan.repository_owner}
            repositoryName={scan.scan.repository_name}
            emptyState={
              <Box
                sx={{
                  p: 4,
                  textAlign: "center",
                  backgroundColor: palette.background.accent,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No API calls detected in this repository
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.accent, mt: 1 }}>
                  API calls to OpenAI, Anthropic, Google AI, and other AI services will appear here
                </Typography>
              </Box>
            }
            page={apiCallState.page}
            totalPages={apiCallState.totalPages}
            onPageChange={apiCallState.setPage}
          />
        )}

        {/* Models Tab */}
        {activeTab === "models" && (
          <FindingsTabPanel
            description="Pre-trained AI/ML model references detected in the codebase. These include Hugging Face models, Ollama models, and other model identifiers."
            summaryBox={{
              icon: Package,
              text: `${scan.summary.by_finding_type?.model_ref || 0} model reference${
                (scan.summary.by_finding_type?.model_ref || 0) !== 1 ? "s" : ""
              } detected`,
              subtext:
                "Model references indicate usage of pre-trained models from Hugging Face Hub, Ollama, and other sources.",
            }}
            findings={modelState.findings}
            showSuppressed={showSuppressed}
            scanId={scanId}
            repositoryOwner={scan.scan.repository_owner}
            repositoryName={scan.scan.repository_name}
            emptyState={
              <Box
                sx={{
                  p: 4,
                  textAlign: "center",
                  backgroundColor: palette.background.accent,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No model references detected in this repository
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.accent, mt: 1 }}>
                  References to Hugging Face models, Ollama models, and other pre-trained models
                  will appear here
                </Typography>
              </Box>
            }
            page={modelState.page}
            totalPages={modelState.totalPages}
            onPageChange={modelState.setPage}
          />
        )}

        {/* RAG Tab */}
        {activeTab === "rag" && (
          <FindingsTabPanel
            description="RAG (Retrieval-Augmented Generation) pipeline components detected in the codebase. These include vector databases, document loaders, and embedding models."
            summaryBox={{
              icon: Info,
              text: `${scan.summary.by_finding_type?.rag_component || 0} RAG component${
                (scan.summary.by_finding_type?.rag_component || 0) !== 1 ? "s" : ""
              } detected`,
              subtext:
                "RAG components indicate usage of vector databases, document loaders, and embedding systems for retrieval-augmented generation.",
            }}
            findings={ragState.findings}
            showSuppressed={showSuppressed}
            scanId={scanId}
            repositoryOwner={scan.scan.repository_owner}
            repositoryName={scan.scan.repository_name}
            emptyState={
              <Box
                sx={{
                  p: 4,
                  textAlign: "center",
                  backgroundColor: palette.background.accent,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No RAG components detected in this repository
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.accent, mt: 1 }}>
                  Vector databases (Pinecone, Chroma, Qdrant), document loaders, and embedding
                  models will appear here
                </Typography>
              </Box>
            }
            page={ragState.page}
            totalPages={ragState.totalPages}
            onPageChange={ragState.setPage}
          />
        )}

        {/* Agents Tab */}
        {activeTab === "agents" && (
          <FindingsTabPanel
            description="AI agent frameworks and autonomous systems detected in the codebase. These include LangChain agents, CrewAI, AutoGen, and MCP servers."
            alertBox={{
              severity: "warning",
              title: "Autonomous AI systems detected",
              body: "AI agents can take autonomous actions and interact with external systems. Review these carefully for governance and security implications.",
            }}
            summaryBox={{
              icon: Info,
              text: `${scan.summary.by_finding_type?.agent || 0} agent framework${
                (scan.summary.by_finding_type?.agent || 0) !== 1 ? "s" : ""
              } detected`,
              subtext:
                "Agent findings are marked as high risk due to their autonomous nature and ability to interact with external systems.",
            }}
            findings={agentState.findings}
            showSuppressed={showSuppressed}
            scanId={scanId}
            repositoryOwner={scan.scan.repository_owner}
            repositoryName={scan.scan.repository_name}
            emptyState={
              <Box
                sx={{
                  p: 4,
                  textAlign: "center",
                  backgroundColor: palette.background.accent,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No AI agents detected in this repository
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.accent, mt: 1 }}>
                  LangChain agents, CrewAI, AutoGen, MCP servers, and other autonomous AI systems
                  will appear here
                </Typography>
              </Box>
            }
            page={agentState.page}
            totalPages={agentState.totalPages}
            onPageChange={agentState.setPage}
          />
        )}

        {/* Secrets Tab */}
        {activeTab === "secrets" && (
          <FindingsTabPanel
            description="Hardcoded API keys and secrets detected in the codebase. These should be moved to environment variables or a secrets manager."
            alertBox={{
              severity: "error",
              title: "Security risk detected",
              body: "Hardcoded secrets in source code can be exposed if the repository is made public or accessed by unauthorized users. Rotate any exposed credentials immediately.",
            }}
            findings={secretState.findings}
            showSuppressed={showSuppressed}
            scanId={scanId}
            repositoryOwner={scan.scan.repository_owner}
            repositoryName={scan.scan.repository_name}
            emptyState={
              <Box
                sx={{
                  p: "16px",
                  textAlign: "center",
                  backgroundColor: palette.status.success.bg,
                  border: `1px solid ${palette.status.success.border}`,
                  borderRadius: "4px",
                  mt: "8px",
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                  <ShieldCheck size={48} color={palette.status.success.text} />
                </Box>
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: palette.status.success.text,
                    mb: 1,
                  }}
                >
                  No hardcoded secrets detected
                </Typography>
                <Typography sx={{ fontSize: "13px", color: palette.text.tertiary }}>
                  No API keys, tokens, or other secrets were found in the scanned code.
                </Typography>
              </Box>
            }
            page={secretState.page}
            totalPages={secretState.totalPages}
            onPageChange={secretState.setPage}
          />
        )}

        {/* Security Tab */}
        {activeTab === "security" && (
          <SecurityFindingsTab
            summary={securitySummary}
            findings={securityState.findings}
            page={securityState.page}
            totalPages={securityState.totalPages}
            onPageChange={securityState.setPage}
            severityFilter={severityFilter}
            onSeverityFilterChange={setSeverityFilter}
            repositoryOwner={scan.scan.repository_owner}
            repositoryName={scan.scan.repository_name}
          />
        )}

        {/* Compliance Tab */}
        {activeTab === "compliance" && (
          <ComplianceTab complianceData={complianceData} complianceLoading={complianceLoading} />
        )}

        {/* Vulnerabilities Tab */}
        {activeTab === "vulnerabilities" && (
          <VulnerabilitiesTab
            vulnerabilityFindings={vulnerabilityFindings}
            showSuppressed={showSuppressed}
            scanId={scanId}
            repositoryOwner={scan.scan.repository_owner}
            repositoryName={scan.scan.repository_name}
            onStatusMessage={showAlert}
          />
        )}
      </TabContext>

      {/* AI Dependency Graph Modal */}
      <AIDepGraphModal
        open={showDepGraph}
        onClose={() => setShowDepGraph(false)}
        scanId={scanId}
        repositoryName={`${scan.scan.repository_owner}/${scan.scan.repository_name}`}
        repositoryUrl={scan.scan.repository_url}
      />
    </PageHeaderExtended>
  );
}
