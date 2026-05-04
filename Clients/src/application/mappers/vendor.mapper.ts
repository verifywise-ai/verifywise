/**
 * Vendor Mapper
 *
 * Maps between Vendor DTOs (API layer) and Vendor domain models.
 * Handles data transformation, type conversion, and validation.
 */

import { VendorModel } from "../../domain/models/Common/vendor/vendor.model";
import { VendorResponseDTO, CreateVendorDTO, UpdateVendorDTO } from "../dtos/vendor.dto";
import {
  ReviewStatus,
  DataSensitivity,
  BusinessCriticality,
  PastIssues,
  RegulatoryExposure,
} from "../../domain/enums/status.enum";

/**
 * Converts string review status to ReviewStatus enum
 */
export function mapReviewStatus(status: string): ReviewStatus {
  const mapping: Record<string, ReviewStatus> = {
    "not started": ReviewStatus.NotStarted,
    "in review": ReviewStatus.InReview,
    reviewed: ReviewStatus.Reviewed,
    "requires follow-up": ReviewStatus.RequiresFollowUp,
  };
  return mapping[status] || ReviewStatus.NotStarted;
}

/**
 * Converts string data sensitivity to DataSensitivity enum
 */
export function mapDataSensitivity(value?: string): DataSensitivity | undefined {
  if (!value) return undefined;
  const mapping: Record<string, DataSensitivity> = {
    none: DataSensitivity.None,
    "internal only": DataSensitivity.InternalOnly,
    "personally identifiable information (pii)": DataSensitivity.PII,
    "financial data": DataSensitivity.FinancialData,
    "health data (e.g. hipaa)": DataSensitivity.HealthData,
    "model weights or ai assets": DataSensitivity.ModelWeights,
    "other sensitive data": DataSensitivity.OtherSensitive,
  };
  return mapping[value.toLowerCase()] || DataSensitivity.None;
}

/**
 * Converts string business criticality to BusinessCriticality enum
 */
export function mapBusinessCriticality(value?: string): BusinessCriticality | undefined {
  if (!value) return undefined;
  const mapping: Record<string, BusinessCriticality> = {
    "low (vendor supports non-core functions)": BusinessCriticality.Low,
    "medium (affects operations but is replaceable)": BusinessCriticality.Medium,
    "high (critical to core services or products)": BusinessCriticality.High,
  };
  return mapping[value.toLowerCase()] || BusinessCriticality.Low;
}

/**
 * Converts string past issues to PastIssues enum
 */
export function mapPastIssues(value?: string): PastIssues | undefined {
  if (!value) return undefined;
  const mapping: Record<string, PastIssues> = {
    none: PastIssues.None,
    "minor incident (e.g. small delay, minor bug)": PastIssues.MinorIncident,
    "major incident (e.g. data breach, legal issue)": PastIssues.MajorIncident,
  };
  return mapping[value.toLowerCase()] || PastIssues.None;
}

/**
 * Converts string regulatory exposure to RegulatoryExposure enum
 */
export function mapRegulatoryExposure(value?: string): RegulatoryExposure | undefined {
  if (!value) return undefined;
  const mapping: Record<string, RegulatoryExposure> = {
    none: RegulatoryExposure.None,
    "gdpr (eu)": RegulatoryExposure.GDPR,
    "hipaa (us)": RegulatoryExposure.HIPAA,
    "soc 2": RegulatoryExposure.SOC2,
    "iso 27001": RegulatoryExposure.ISO27001,
    "eu ai act": RegulatoryExposure.EUAIAct,
    "ccpa (california)": RegulatoryExposure.CCPA,
    other: RegulatoryExposure.Other,
  };
  return mapping[value.toLowerCase()] || RegulatoryExposure.None;
}

/**
 * Maps a VendorResponseDTO to a VendorModel
 *
 * @param dto - Vendor response DTO from API
 * @returns VendorModel instance
 */
export function mapVendorResponseDTOToModel(dto: VendorResponseDTO): VendorModel {
  const vendorData: VendorModel = {
    id: dto.id,
    order_no: dto.order_no,
    vendor_name: dto.vendor_name,
    vendor_provides: dto.vendor_provides,
    assignee: dto.assignee,
    website: dto.website,
    vendor_contact_person: dto.vendor_contact_person,
    review_result: dto.review_result,
    review_status: mapReviewStatus(dto.review_status),
    reviewer: dto.reviewer,
    review_date: new Date(dto.review_date),
    is_demo: dto.is_demo,
    created_at: dto.created_at ? new Date(dto.created_at) : undefined,
    projects: dto.projects,
    data_sensitivity: mapDataSensitivity(dto.data_sensitivity),
    business_criticality: mapBusinessCriticality(dto.business_criticality),
    past_issues: mapPastIssues(dto.past_issues),
    regulatory_exposure: mapRegulatoryExposure(dto.regulatory_exposure),
    risk_score: dto.risk_score,
  };

  return new VendorModel(vendorData);
}

/**
 * Maps an array of VendorResponseDTOs to VendorModel instances
 *
 * @param dtos - Array of vendor response DTOs
 * @returns Array of VendorModel instances
 */
export function mapVendorResponseDTOsToModels(dtos: VendorResponseDTO[]): VendorModel[] {
  return dtos.map(mapVendorResponseDTOToModel);
}

/**
 * Maps VendorModel to CreateVendorDTO
 *
 * @param vendor - VendorModel instance
 * @returns CreateVendorDTO
 */
export function mapVendorToCreateDTO(vendor: Partial<VendorModel>): CreateVendorDTO {
  return {
    vendor_name: vendor.vendor_name || "",
    vendor_provides: vendor.vendor_provides || "",
    assignee: vendor.assignee || 0,
    website: vendor.website || "",
    vendor_contact_person: vendor.vendor_contact_person || "",
    review_result: vendor.review_result || "",
    review_status: vendor.review_status || ReviewStatus.NotStarted,
    reviewer: vendor.reviewer || 0,
    review_date: vendor.review_date?.toISOString() || new Date().toISOString(),
    projects: vendor.projects,
    data_sensitivity: vendor.data_sensitivity,
    business_criticality: vendor.business_criticality,
    past_issues: vendor.past_issues,
    regulatory_exposure: vendor.regulatory_exposure,
  };
}

/**
 * Maps VendorModel to UpdateVendorDTO
 *
 * @param vendor - VendorModel instance with fields to update
 * @returns UpdateVendorDTO
 */
export function mapVendorToUpdateDTO(vendor: Partial<VendorModel>): UpdateVendorDTO {
  return {
    vendor_name: vendor.vendor_name,
    vendor_provides: vendor.vendor_provides,
    assignee: vendor.assignee,
    website: vendor.website,
    vendor_contact_person: vendor.vendor_contact_person,
    review_result: vendor.review_result,
    review_status: vendor.review_status,
    reviewer: vendor.reviewer,
    review_date: vendor.review_date?.toISOString(),
    projects: vendor.projects,
    data_sensitivity: vendor.data_sensitivity,
    business_criticality: vendor.business_criticality,
    past_issues: vendor.past_issues,
    regulatory_exposure: vendor.regulatory_exposure,
  };
}
