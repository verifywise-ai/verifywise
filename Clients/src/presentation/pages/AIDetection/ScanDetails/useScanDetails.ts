/**
 * @fileoverview Data-fetching and UI state for the Scan Details page.
 *
 * @module pages/AIDetection/ScanDetails/useScanDetails
 */

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import {
  getScan,
  getScanFindings,
  getScanSecurityFindings,
  getScanSecuritySummary,
  exportAIBOM,
  recalculateRiskScore,
} from "../../../../application/repository/aiDetection.repository";
import {
  ScanResponse,
  ConfidenceLevel,
  SecuritySeverity,
  SecuritySummary,
  SecurityFinding,
  Finding,
  ComplianceMappingResponse,
} from "../../../../domain/ai-detection/types";
import { TabValue } from "./scanDetailsConfig";
import { usePaginatedFindings } from "./usePaginatedFindings";
import { useScanFindingsEffects } from "./useScanFindingsEffects";
import { LLM_ANALYSIS_POLL_ATTEMPTS, LLM_ANALYSIS_POLL_MS } from "../components/governanceScore";

export type ScanDetailsAlert = { variant: "success" | "error"; body: string };

export function useScanDetails() {
  const navigate = useNavigate();
  const { scanId: scanIdParam, tab } = useParams<{ scanId: string; tab?: string }>();
  const scanId = parseInt(scanIdParam || "0", 10);
  const initialTab: TabValue = (tab as TabValue) || "libraries";

  const [scan, setScan] = useState<ScanResponse | null>(null);
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
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceLevel | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SecuritySeverity | null>(null);
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDepGraph, setShowDepGraph] = useState(false);
  const [complianceData, setComplianceData] = useState<ComplianceMappingResponse | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [alert, setAlert] = useState<ScanDetailsAlert | null>(null);

  // Whether this is the repository's latest completed scan; status changes on
  // any other scan apply to that scan only
  const [isLatestScan, setIsLatestScan] = useState<boolean | undefined>(undefined);

  const showAlert = (variant: "success" | "error", body: string) => {
    setAlert({ variant, body });
    setTimeout(() => setAlert(null), 3000);
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue as TabValue);
    navigate(`/ai-detection/scans/${scanId}/${newValue}`, { replace: true });
  };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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
        setIsLatestScan(findingsResponse.is_latest_scan);
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
        setVulnerabilityFindings(vulnFindingsResponses.flatMap((r) => r.findings));
      } catch {
        // Error loading scan - page shows empty/error state
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [scanId]);

  useScanFindingsEffects({
    scanId,
    scan,
    confidenceFilter,
    severityFilter,
    activeTab,
    complianceData,
    setComplianceData,
    setComplianceLoading,
    setSecuritySummary,
    libraryState,
    apiCallState,
    secretState,
    modelState,
    ragState,
    agentState,
    securityState,
  });

  // Background AI analysis: re-read the scan until it finishes. The server
  // reports a long-pending analysis as failed, so this stops well before the cap.
  const llmPending = scan?.scan.risk_score_details?.llm_status === "pending";
  useEffect(() => {
    if (!llmPending) return undefined;
    let cancelled = false;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts >= LLM_ANALYSIS_POLL_ATTEMPTS) clearInterval(timer);
      try {
        const fresh = await getScan(scanId);
        if (!cancelled) setScan(fresh);
      } catch {
        // Keep the current score; the next tick tries again
      }
    }, LLM_ANALYSIS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [llmPending, scanId]);

  const handleRecalculateRiskScore = async () => {
    // A recalculation would start a second paid LLM run; the server refuses it too
    if (!scan || llmPending) return;
    setIsRecalculating(true);
    try {
      const result = await recalculateRiskScore(scanId);
      setScan(await getScan(scanId));
      showAlert(
        "success",
        `Governance score updated: ${Math.round(result.score)} (${result.grade})`,
      );
    } catch {
      showAlert("error", "Failed to calculate the governance score");
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleExportAIBOM = async () => {
    if (!scan || isExporting) return;
    setIsExporting(true);
    try {
      const aiBomData = await exportAIBOM(scanId);
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

  return {
    scanId,
    scan,
    isLatestScan,
    isLoading,
    activeTab,
    handleTabChange,
    confidenceFilter,
    setConfidenceFilter,
    severityFilter,
    setSeverityFilter,
    showSuppressed,
    setShowSuppressed,
    isExporting,
    showDepGraph,
    setShowDepGraph,
    complianceData,
    complianceLoading,
    isRecalculating,
    alert,
    setAlert,
    showAlert,
    libraryState,
    apiCallState,
    secretState,
    modelState,
    ragState,
    agentState,
    securityState,
    securitySummary,
    vulnerabilityFindings,
    handleRecalculateRiskScore,
    handleExportAIBOM,
    navigate,
  };
}
