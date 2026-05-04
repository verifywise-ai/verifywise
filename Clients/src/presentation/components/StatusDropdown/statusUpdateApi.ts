/**
 * Status Update API Functions
 *
 * Comprehensive API layer for updating status across all ISO framework components.
 * Handles the complex data requirements and endpoint differences between frameworks.
 *
 * Key Features:
 * - Proper data fetching and preservation
 * - Framework-specific API endpoints
 * - Robust error handling
 * - Type-safe parameter handling
 */

import { updateEntityById, getEntityById } from "../../../application/repository/entity.repository";
import { UpdateAnnexCategoryById } from "../../../application/repository/annexCategory_iso.repository";
import { isSuccessResponse } from "../../../application/utils/frameworkDataUtils";

export interface StatusUpdateParams {
  id: number;
  newStatus: string;
  projectFrameworkId: number;
  userId?: number;
  currentData?: Record<string, unknown>; // Optional fallback data
}

/**
 * Update status for ISO27001 clause subclauses
 */
export async function updateISO27001ClauseStatus({
  id,
  newStatus,
  projectFrameworkId,
  userId = 1,
  currentData,
}: StatusUpdateParams): Promise<boolean> {
  try {
    // Fetch current subclause data to preserve existing fields
    let subClauseData: Record<string, unknown> = currentData || {};

    const _response = await getEntityById({
      routeUrl: `/iso-27001/subClause/byId/${id}?projectFrameworkId=${projectFrameworkId}`,
    });
    subClauseData = _response?.data || {};

    const formData = new FormData();

    // Include all required fields based on drawer implementation
    formData.append(
      "implementation_description",
      String(subClauseData.implementation_description || ""),
    );
    formData.append("status", newStatus);

    // Only append integer fields if they have valid values
    if (subClauseData.owner && !isNaN(Number(subClauseData.owner))) {
      formData.append("owner", subClauseData.owner.toString());
    }
    if (subClauseData.reviewer && !isNaN(Number(subClauseData.reviewer))) {
      formData.append("reviewer", subClauseData.reviewer.toString());
    }
    if (subClauseData.approver && !isNaN(Number(subClauseData.approver))) {
      formData.append("approver", subClauseData.approver.toString());
    }

    formData.append("auditor_feedback", String(subClauseData.auditor_feedback || ""));
    formData.append("user_id", userId.toString());
    formData.append("project_id", "0");
    formData.append("delete", "[]");
    formData.append("risksMitigated", JSON.stringify(subClauseData.risks || []));
    formData.append("risksDelete", "[]");

    if (subClauseData.due_date) {
      formData.append("due_date", String(subClauseData.due_date));
    }

    const response = await updateEntityById({
      routeUrl: `/iso-27001/saveClauses/${subClauseData.id}`,
      body: formData,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response?.status ? isSuccessResponse(response.status) : false;
  } catch (error) {
    console.error("Error updating ISO27001 clause status:", error);
    return false;
  }
}

/**
 * Update status for ISO27001 annex controls
 */
export async function updateISO27001AnnexStatus({
  id,
  projectFrameworkId,
  newStatus,
  userId = 1,
  currentData,
}: StatusUpdateParams): Promise<boolean> {
  try {
    // Use currentData directly since annex controls are already loaded in the UI
    const controlData = currentData || {};

    const _response = await getEntityById({
      routeUrl: `/iso-27001/annexControl/byId/${id}?projectFrameworkId=${projectFrameworkId}`,
    });
    const annexControlId = _response?.data.id;

    const formData = new FormData();

    // Include all required fields based on drawer implementation
    formData.append(
      "implementation_description",
      String(controlData.implementation_description || ""),
    );
    formData.append("status", newStatus);

    // Only append integer fields if they have valid values
    if (controlData.owner && !isNaN(Number(controlData.owner))) {
      formData.append("owner", controlData.owner.toString());
    }
    if (controlData.reviewer && !isNaN(Number(controlData.reviewer))) {
      formData.append("reviewer", controlData.reviewer.toString());
    }
    if (controlData.approver && !isNaN(Number(controlData.approver))) {
      formData.append("approver", controlData.approver.toString());
    }

    formData.append("auditor_feedback", String(controlData.auditor_feedback || ""));
    formData.append("applicable", String(controlData.applicable?.toString() || "true"));
    formData.append("user_id", userId.toString());
    formData.append("project_id", "0");
    formData.append("delete", "[]");
    formData.append("risksMitigated", JSON.stringify(controlData.risks || []));
    formData.append("risksDelete", "[]");

    if (controlData.due_date) {
      formData.append("due_date", String(controlData.due_date));
    }

    const response = await updateEntityById({
      routeUrl: `/iso-27001/saveAnnexes/${annexControlId}`,
      body: formData,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response?.status ? isSuccessResponse(response.status) : false;
  } catch (error) {
    console.error("Error updating ISO27001 annex status:", error);
    return false;
  }
}

/**
 * Update status for NIST AI RMF subcategories
 */
export async function updateNISTAIRMFSubcategoryStatus({
  id,
  newStatus,
  projectFrameworkId: _projectFrameworkId,
  userId: _userId,
  currentData: _currentData,
}: StatusUpdateParams): Promise<boolean> {
  try {
    // For NIST AI RMF, we can use a simple JSON request since it doesn't require FormData
    // The backend endpoint handles status-only updates efficiently
    const response = await updateEntityById({
      routeUrl: `/nist-ai-rmf/subcategories/${id}/status`,
      body: {
        status: newStatus,
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    return response?.status ? isSuccessResponse(response.status) : false;
  } catch (error) {
    console.error("Error updating NIST AI RMF subcategory status:", error);
    return false;
  }
}

/**
 * Update status for ISO42001 clause subclauses
 */
export async function updateISO42001ClauseStatus({
  id,
  newStatus,
  projectFrameworkId,
  userId = 1,
  currentData,
}: StatusUpdateParams): Promise<boolean> {
  try {
    // Fetch current subclause data to preserve existing fields
    let subClauseData: Record<string, unknown> = currentData || {};

    const _response = await getEntityById({
      routeUrl: `/iso-42001/subClause/byId/${id}?projectFrameworkId=${projectFrameworkId}`,
    });
    subClauseData = _response?.data || {};

    const formData = new FormData();

    // Include all required fields based on drawer implementation
    formData.append(
      "implementation_description",
      String(subClauseData.implementation_description || ""),
    );
    formData.append("status", newStatus);

    // Only append integer fields if they have valid values
    if (subClauseData.owner && !isNaN(Number(subClauseData.owner))) {
      formData.append("owner", subClauseData.owner.toString());
    }
    if (subClauseData.reviewer && !isNaN(Number(subClauseData.reviewer))) {
      formData.append("reviewer", subClauseData.reviewer.toString());
    }
    if (subClauseData.approver && !isNaN(Number(subClauseData.approver))) {
      formData.append("approver", subClauseData.approver.toString());
    }

    formData.append("auditor_feedback", String(subClauseData.auditor_feedback || ""));
    formData.append("user_id", userId.toString());
    formData.append("project_id", "0");
    formData.append("delete", "[]");
    formData.append("risksMitigated", JSON.stringify(subClauseData.risks || []));
    formData.append("risksDelete", "[]");

    if (subClauseData.due_date) {
      formData.append("due_date", String(subClauseData.due_date));
    }

    const response = await updateEntityById({
      routeUrl: `/iso-42001/saveClauses/${subClauseData.id}`,
      body: formData,
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return response?.status ? isSuccessResponse(response.status) : false;
  } catch (error) {
    console.error("Error updating ISO42001 clause status:", error);
    return false;
  }
}

/**
 * Update status for ISO42001 annex controls
 */
export async function updateISO42001AnnexStatus({
  id,
  projectFrameworkId,
  newStatus,
  userId = 1,
  currentData,
}: StatusUpdateParams): Promise<boolean> {
  try {
    // Use currentData directly since annex controls are already loaded in the UI
    const controlData = currentData || {};

    const _response = await getEntityById({
      routeUrl: `/iso-42001/annexCategory/byId/${id}?projectFrameworkId=${projectFrameworkId}`,
    });
    const annexCategoryId = _response?.data.id;

    const formData = new FormData();

    // Include all required fields based on drawer implementation
    formData.append(
      "implementation_description",
      String(controlData.implementation_description || ""),
    );
    formData.append("status", newStatus);

    // Only append integer fields if they have valid values
    if (controlData.owner && !isNaN(Number(controlData.owner))) {
      formData.append("owner", controlData.owner.toString());
    }
    if (controlData.reviewer && !isNaN(Number(controlData.reviewer))) {
      formData.append("reviewer", controlData.reviewer.toString());
    }
    if (controlData.approver && !isNaN(Number(controlData.approver))) {
      formData.append("approver", controlData.approver.toString());
    }

    formData.append("auditor_feedback", String(controlData.auditor_feedback || ""));
    formData.append("is_applicable", String(controlData.is_applicable?.toString() || "true"));
    formData.append("user_id", userId.toString());
    formData.append("project_id", "0");
    formData.append("delete", "[]");
    formData.append("risksMitigated", JSON.stringify(controlData.risks || []));
    formData.append("risksDelete", "[]");

    if (controlData.due_date) {
      formData.append("due_date", String(controlData.due_date));
    }

    const response = await UpdateAnnexCategoryById({
      routeUrl: `/iso-42001/saveAnnexes/${annexCategoryId}`,
      body: formData,
    });

    return response?.status ? isSuccessResponse(response.status) : false;
  } catch (error) {
    console.error("Error updating ISO42001 annex status:", error);
    return false;
  }
}
