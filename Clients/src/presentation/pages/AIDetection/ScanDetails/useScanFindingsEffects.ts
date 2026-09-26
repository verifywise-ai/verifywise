/**
 * @fileoverview Paginated finding reload effects for scan details tabs.
 *
 * @module pages/AIDetection/ScanDetails/useScanFindingsEffects
 */

import { useEffect } from "react";
import {
  getScanFindings,
  getScanSecurityFindings,
  getScanSecuritySummary,
  getComplianceMapping,
} from "../../../../application/repository/aiDetection.repository";
import {
  ConfidenceLevel,
  SecuritySeverity,
  SecuritySummary,
  SecurityFinding,
  Finding,
  ComplianceMappingResponse,
  ScanResponse,
} from "../../../../domain/ai-detection/types";
import { TabValue } from "./scanDetailsConfig";

type PaginatedState<T> = {
  page: number;
  setFindings: (findings: T[]) => void;
  setTotalPages: (n: number) => void;
};

interface UseScanFindingsEffectsArgs {
  scanId: number;
  scan: ScanResponse | null;
  confidenceFilter: ConfidenceLevel | null;
  severityFilter: SecuritySeverity | null;
  activeTab: TabValue;
  complianceData: ComplianceMappingResponse | null;
  setComplianceData: (data: ComplianceMappingResponse | null) => void;
  setComplianceLoading: (loading: boolean) => void;
  setSecuritySummary: (summary: SecuritySummary | null) => void;
  libraryState: PaginatedState<Finding>;
  apiCallState: PaginatedState<Finding>;
  secretState: PaginatedState<Finding>;
  modelState: PaginatedState<Finding>;
  ragState: PaginatedState<Finding>;
  agentState: PaginatedState<Finding>;
  securityState: PaginatedState<SecurityFinding>;
}

export function useScanFindingsEffects({
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
}: UseScanFindingsEffectsArgs) {
  useEffect(() => {
    if (!scan) return;
    const load = async () => {
      try {
        const response = await getScanFindings(scanId, {
          page: libraryState.page,
          limit: 50,
          confidence: confidenceFilter || undefined,
          finding_type: "library",
        });
        libraryState.setFindings(response.findings);
        libraryState.setTotalPages(response.pagination.total_pages);
      } catch {
        // UI shows empty state
      }
    };
    load();
  }, [scanId, libraryState.page, confidenceFilter, scan]);

  useEffect(() => {
    if (!scan) return;
    const load = async () => {
      try {
        const response = await getScanFindings(scanId, {
          page: apiCallState.page,
          limit: 50,
          finding_type: "api_call",
        });
        apiCallState.setFindings(response.findings);
        apiCallState.setTotalPages(response.pagination.total_pages);
      } catch {
        // UI shows empty state
      }
    };
    load();
  }, [scanId, apiCallState.page, scan]);

  useEffect(() => {
    if (!scan) return;
    const load = async () => {
      try {
        const response = await getScanFindings(scanId, {
          page: secretState.page,
          limit: 50,
          finding_type: "secret",
        });
        secretState.setFindings(response.findings);
        secretState.setTotalPages(response.pagination.total_pages);
      } catch {
        // UI shows empty state
      }
    };
    load();
  }, [scanId, secretState.page, scan]);

  useEffect(() => {
    if (!scan) return;
    const load = async () => {
      try {
        const response = await getScanFindings(scanId, {
          page: modelState.page,
          limit: 50,
          finding_type: "model_ref",
        });
        modelState.setFindings(response.findings);
        modelState.setTotalPages(response.pagination.total_pages);
      } catch {
        // UI shows empty state
      }
    };
    load();
  }, [scanId, modelState.page, scan]);

  useEffect(() => {
    if (!scan) return;
    const load = async () => {
      try {
        const response = await getScanFindings(scanId, {
          page: ragState.page,
          limit: 50,
          finding_type: "rag_component",
        });
        ragState.setFindings(response.findings);
        ragState.setTotalPages(response.pagination.total_pages);
      } catch {
        // UI shows empty state
      }
    };
    load();
  }, [scanId, ragState.page, scan]);

  useEffect(() => {
    if (!scan) return;
    const load = async () => {
      try {
        const response = await getScanFindings(scanId, {
          page: agentState.page,
          limit: 50,
          finding_type: "agent",
        });
        agentState.setFindings(response.findings);
        agentState.setTotalPages(response.pagination.total_pages);
      } catch {
        // UI shows empty state
      }
    };
    load();
  }, [scanId, agentState.page, scan]);

  useEffect(() => {
    if (!scan) return;
    const load = async () => {
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
        // UI shows empty state
      }
    };
    load();
  }, [scanId, securityState.page, severityFilter, scan]);

  useEffect(() => {
    if (activeTab !== "compliance" || !scan || complianceData) return;
    const load = async () => {
      setComplianceLoading(true);
      try {
        setComplianceData(await getComplianceMapping(scanId));
      } catch {
        // UI shows empty state
      } finally {
        setComplianceLoading(false);
      }
    };
    load();
  }, [activeTab, scanId, scan, complianceData]);
}
