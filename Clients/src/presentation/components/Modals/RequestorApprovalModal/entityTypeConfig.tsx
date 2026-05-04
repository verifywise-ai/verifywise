/**
 * Entity Type Configuration for Approval Requests
 *
 * This module provides a modular way to handle different entity types in approval requests.
 * To add a new entity type:
 * 1. Add the entity type key to EntityTypeKey
 * 2. Add the configuration to ENTITY_TYPE_CONFIGS
 * 3. Add field extraction logic to extractEntityDetails
 */

import React from "react";
import {
  User,
  Calendar,
  FileText,
  Briefcase,
  Target,
  PackageOpen,
  File,
  HardDrive,
  Bot,
  Wrench,
} from "lucide-react";
import dayjs from "dayjs";

// Supported entity types
export type EntityTypeKey = "use_case" | "file" | "ai_action";

// Detail field configuration
export interface DetailFieldConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  format?: (value: any) => string;
}

// Entity type configuration
export interface EntityTypeConfig {
  title: string;
  deletedMessage: string;
  noDataMessage: string;
  fields: DetailFieldConfig[];
}

// Format helpers
const formatDate = (value: any) => dayjs(value).format("YYYY-MM-DD, HH:mm");
const formatDateOnly = (value: any) => dayjs(value).format("YYYY-MM-DD");
const formatFileSize = (value: any) => {
  if (!value) return "";
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

// Entity type configurations
export const ENTITY_TYPE_CONFIGS: Record<EntityTypeKey, EntityTypeConfig> = {
  use_case: {
    title: "Use Case Details",
    deletedMessage: "The use-case associated with this request has been deleted.",
    noDataMessage: "No additional use case details available",
    fields: [
      { key: "entityName", label: "Use case", icon: <FileText size={14} /> },
      { key: "entityId", label: "Use case ID", icon: <FileText size={14} /> },
      { key: "owner", label: "Owner", icon: <User size={14} /> },
      { key: "projectStatus", label: "Status", icon: <FileText size={14} /> },
      {
        key: "aiRiskClassification",
        label: "AI Risk Classification",
        icon: <Briefcase size={14} />,
      },
      { key: "typeOfHighRiskRole", label: "High Risk Role", icon: <PackageOpen size={14} /> },
      { key: "goal", label: "Goal", icon: <Target size={14} /> },
      { key: "targetIndustry", label: "Target Industry", icon: <Briefcase size={14} /> },
      {
        key: "startDate",
        label: "Start Date",
        icon: <Calendar size={14} />,
        format: formatDateOnly,
      },
      { key: "projectDescription", label: "Description", icon: <FileText size={14} /> },
    ],
  },
  file: {
    title: "File Details",
    deletedMessage: "The file associated with this request has been deleted.",
    noDataMessage: "No additional file details available",
    fields: [
      { key: "fileName", label: "File name", icon: <File size={14} /> },
      { key: "fileType", label: "File type", icon: <FileText size={14} /> },
      {
        key: "fileSize",
        label: "File size",
        icon: <HardDrive size={14} />,
        format: formatFileSize,
      },
      { key: "fileUploader", label: "Uploaded by", icon: <User size={14} /> },
      {
        key: "fileUploadedTime",
        label: "Upload date",
        icon: <Calendar size={14} />,
        format: formatDate,
      },
    ],
  },
  ai_action: {
    title: "AI Action Details",
    deletedMessage: "The AI action payload for this request is missing.",
    noDataMessage: "No AI action details available",
    fields: [
      { key: "aiToolName", label: "Tool", icon: <Wrench size={14} /> },
      { key: "aiPreview", label: "Proposed action", icon: <Bot size={14} /> },
      { key: "aiInputParamsJson", label: "Parameters", icon: <FileText size={14} /> },
      { key: "aiRequestedVia", label: "Requested via", icon: <FileText size={14} /> },
    ],
  },
};

// Default config for unknown entity types
export const DEFAULT_ENTITY_CONFIG: EntityTypeConfig = {
  title: "Entity Details",
  deletedMessage: "The entity associated with this request has been deleted.",
  noDataMessage: "No additional details available",
  fields: [],
};

/**
 * Get entity type configuration
 */
export function getEntityTypeConfig(entityType: string | undefined): EntityTypeConfig {
  if (!entityType) return DEFAULT_ENTITY_CONFIG;
  return ENTITY_TYPE_CONFIGS[entityType as EntityTypeKey] || DEFAULT_ENTITY_CONFIG;
}

/**
 * Extract entity details from API response based on entity type
 */
export function extractEntityDetails(requestData: any): Record<string, any> {
  const entityType = requestData.entity_type;

  // Build common names
  const requesterName =
    requestData.requester_name && requestData.requester_surname
      ? `${requestData.requester_name} ${requestData.requester_surname}`
      : requestData.requester_name || requestData.requester_surname;

  const ownerName =
    requestData.owner_name && requestData.owner_surname
      ? `${requestData.owner_name} ${requestData.owner_surname}`
      : requestData.owner_name || requestData.owner_surname;

  const fileUploaderName =
    requestData.file_uploader_name && requestData.file_uploader_surname
      ? `${requestData.file_uploader_name} ${requestData.file_uploader_surname}`
      : requestData.file_uploader_name || requestData.file_uploader_surname;

  // Base details common to all entity types
  const baseDetails = {
    entityType,
    requester: requesterName,
    requesterEmail: requestData.requester_email,
    dateCreated: requestData.created_at,
    workflowName: requestData.workflow_name,
  };

  // Entity-specific details
  switch (entityType) {
    case "file":
      return {
        ...baseDetails,
        // Primary identifier for deletion check
        entityName: requestData.file_name,
        // File-specific fields
        fileName: requestData.file_name,
        fileSize: requestData.file_size,
        fileType: requestData.file_type,
        fileReviewStatus: requestData.file_review_status,
        fileUploadedTime: requestData.file_uploaded_time,
        fileUploader: fileUploaderName,
      };

    case "ai_action": {
      // AI action payloads live entirely inside entity_data (JSONB).
      // Postgres returns JSONB as a parsed object, but guard for string.
      const raw = requestData.entity_data;
      const payload =
        typeof raw === "string"
          ? (() => {
              try {
                return JSON.parse(raw);
              } catch {
                return {};
              }
            })()
          : raw || {};
      const toolName = payload.tool_name as string | undefined;
      return {
        ...baseDetails,
        // Use preview as the primary identifier so isEntityDeleted works
        entityName: payload.preview || toolName || "AI action",
        aiToolName: toolName,
        aiPreview: payload.preview,
        aiRequestedVia: payload.requested_via,
        aiInputParamsJson: payload.input_params
          ? JSON.stringify(payload.input_params, null, 2)
          : undefined,
        aiResult: payload.result,
      };
    }

    case "use_case":
    default:
      return {
        ...baseDetails,
        entityName: requestData.project_title,
        entityId: requestData.uc_id,
        projectDescription: requestData.project_description,
        owner: ownerName,
        ownerEmail: requestData.owner_email,
        projectStatus: requestData.project_status,
        goal: requestData.goal,
        targetIndustry: requestData.target_industry,
        aiRiskClassification: requestData.ai_risk_classification,
        typeOfHighRiskRole: requestData.type_of_high_risk_role,
        startDate: requestData.start_date,
        geography: requestData.geography,
      };
  }
}

/**
 * Check if entity has been deleted (no primary identifier)
 */
export function isEntityDeleted(details: Record<string, any>): boolean {
  return !details.entityName;
}

/**
 * Check if entity has any displayable data
 */
export function hasEntityData(details: Record<string, any>, config: EntityTypeConfig): boolean {
  return config.fields.some((field) => details[field.key]);
}
