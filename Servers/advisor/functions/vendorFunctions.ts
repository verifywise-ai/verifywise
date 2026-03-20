import { IVendor } from "../../domain.layer/interfaces/i.vendor";
import { IVendorRisk } from "../../domain.layer/interfaces/i.vendorRisk";
import { getAllVendorsQuery } from "../../utils/vendor.utils";
import { getAllVendorRisksAllProjectsQuery } from "../../utils/vendorRisk.utils";
import logger from "../../utils/logger/fileLogger";

export interface FetchVendorsParams {
  review_status?: "Not started" | "In review" | "Reviewed" | "Requires follow-up";
  data_sensitivity?: string;
  business_criticality?: string;
  regulatory_exposure?: string;
  vendor_name?: string;
  limit?: number;
}

const fetchVendors = async (
  params: FetchVendorsParams,
  organizationId: number,
): Promise<Partial<IVendor>[]> => {
  let vendors: IVendor[] = [];

  try {
    vendors = await getAllVendorsQuery(organizationId);

    // Apply filters
    if (params.review_status) {
      vendors = vendors.filter((v) => v.review_status === params.review_status);
    }
    if (params.data_sensitivity) {
      vendors = vendors.filter((v) => v.data_sensitivity === params.data_sensitivity);
    }
    if (params.business_criticality) {
      vendors = vendors.filter((v) => v.business_criticality === params.business_criticality);
    }
    if (params.regulatory_exposure) {
      vendors = vendors.filter((v) => v.regulatory_exposure === params.regulatory_exposure);
    }
    if (params.vendor_name) {
      vendors = vendors.filter(
        (v) =>
          v.vendor_name &&
          v.vendor_name.toLowerCase().includes(params.vendor_name!.toLowerCase()),
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      vendors = vendors.slice(0, params.limit);
    }

    // Return lightweight projections
    return vendors.map((v) => ({
      id: v.id,
      vendor_name: v.vendor_name,
      vendor_provides: v.vendor_provides,
      review_status: v.review_status,
      review_date: v.review_date,
      data_sensitivity: v.data_sensitivity,
      business_criticality: v.business_criticality,
      regulatory_exposure: v.regulatory_exposure,
      risk_score: v.risk_score,
    }));
  } catch (error) {
    logger.error("Error fetching vendors:", error);
    throw new Error(
      `Failed to fetch vendors: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface FetchVendorRisksParams {
  vendorId?: number;
  likelihood?: "Rare" | "Unlikely" | "Possible" | "Likely" | "Almost certain";
  risk_severity?: "Negligible" | "Minor" | "Moderate" | "Major" | "Catastrophic";
  limit?: number;
}

const fetchVendorRisks = async (
  params: FetchVendorRisksParams,
  organizationId: number,
): Promise<Partial<IVendorRisk>[]> => {
  let risks: IVendorRisk[] = [];

  try {
    risks = await getAllVendorRisksAllProjectsQuery(organizationId, "active") as IVendorRisk[];

    // Apply filters
    if (params.vendorId) {
      risks = risks.filter((r) => r.vendor_id === params.vendorId);
    }
    if (params.likelihood) {
      risks = risks.filter((r) => r.likelihood === params.likelihood);
    }
    if (params.risk_severity) {
      risks = risks.filter((r) => r.risk_severity === params.risk_severity);
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      risks = risks.slice(0, params.limit);
    }

    // Return lightweight projections — exclude verbose text fields
    return risks.map((r) => ({
      id: r.id,
      vendor_id: r.vendor_id,
      likelihood: r.likelihood,
      risk_severity: r.risk_severity,
      risk_level: r.risk_level,
      action_owner: r.action_owner,
    }));
  } catch (error) {
    logger.error("Error fetching vendor risks:", error);
    throw new Error(
      `Failed to fetch vendor risks: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface VendorAnalytics {
  reviewStatusDistribution: {
    [status: string]: number;
  };
  dataSensitivityDistribution: Array<{
    sensitivity: string;
    count: number;
    percentage: number;
  }>;
  businessCriticalityDistribution: Array<{
    criticality: string;
    count: number;
    percentage: number;
  }>;
  regulatoryExposureDistribution: Array<{
    regulation: string;
    count: number;
    percentage: number;
  }>;
  riskScoreDistribution: {
    high: number; // risk_score > 70
    medium: number; // risk_score 40-70
    low: number; // risk_score < 40
    unassessed: number; // no risk_score
  };
  vendorRiskSeverityDistribution: {
    [severity: string]: number;
  };
  totalVendors: number;
  totalVendorRisks: number;
}

const getVendorAnalytics = async (
  _params: Record<string, never>,
  organizationId: number,
): Promise<VendorAnalytics> => {
  try {
    const vendors = await getAllVendorsQuery(organizationId);
    const vendorRisks = await getAllVendorRisksAllProjectsQuery(organizationId, "active") as IVendorRisk[];

    const totalVendors = vendors.length;
    const totalVendorRisks = vendorRisks.length;

    // 1. Review Status Distribution
    const reviewStatuses = ["Not started", "In review", "Reviewed", "Requires follow-up"];
    const reviewStatusDistribution: { [status: string]: number } = {};
    reviewStatuses.forEach((status) => {
      reviewStatusDistribution[status] = 0;
    });

    vendors.forEach((vendor) => {
      if (vendor.review_status) {
        reviewStatusDistribution[vendor.review_status] =
          (reviewStatusDistribution[vendor.review_status] || 0) + 1;
      } else {
        reviewStatusDistribution["Not started"] =
          (reviewStatusDistribution["Not started"] || 0) + 1;
      }
    });

    // 2. Data Sensitivity Distribution
    const sensitivityMap = new Map<string, number>();
    vendors.forEach((vendor) => {
      const sensitivity = vendor.data_sensitivity || "Not specified";
      sensitivityMap.set(sensitivity, (sensitivityMap.get(sensitivity) || 0) + 1);
    });

    const dataSensitivityDistribution = Array.from(sensitivityMap.entries())
      .map(([sensitivity, count]) => ({
        sensitivity,
        count,
        percentage: totalVendors > 0 ? Math.round((count / totalVendors) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 3. Business Criticality Distribution
    const criticalityMap = new Map<string, number>();
    vendors.forEach((vendor) => {
      const criticality = vendor.business_criticality || "Not specified";
      criticalityMap.set(criticality, (criticalityMap.get(criticality) || 0) + 1);
    });

    const businessCriticalityDistribution = Array.from(criticalityMap.entries())
      .map(([criticality, count]) => ({
        criticality,
        count,
        percentage: totalVendors > 0 ? Math.round((count / totalVendors) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 4. Regulatory Exposure Distribution
    const regulatoryMap = new Map<string, number>();
    vendors.forEach((vendor) => {
      const regulation = vendor.regulatory_exposure || "None";
      regulatoryMap.set(regulation, (regulatoryMap.get(regulation) || 0) + 1);
    });

    const regulatoryExposureDistribution = Array.from(regulatoryMap.entries())
      .map(([regulation, count]) => ({
        regulation,
        count,
        percentage: totalVendors > 0 ? Math.round((count / totalVendors) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 5. Risk Score Distribution
    const riskScoreDistribution = {
      high: 0,
      medium: 0,
      low: 0,
      unassessed: 0,
    };

    vendors.forEach((vendor) => {
      if (vendor.risk_score === undefined || vendor.risk_score === null) {
        riskScoreDistribution.unassessed++;
      } else if (vendor.risk_score > 70) {
        riskScoreDistribution.high++;
      } else if (vendor.risk_score >= 40) {
        riskScoreDistribution.medium++;
      } else {
        riskScoreDistribution.low++;
      }
    });

    // 6. Vendor Risk Severity Distribution
    const severities = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];
    const vendorRiskSeverityDistribution: { [severity: string]: number } = {};
    severities.forEach((severity) => {
      vendorRiskSeverityDistribution[severity] = 0;
    });

    vendorRisks.forEach((risk) => {
      if (risk.risk_severity) {
        vendorRiskSeverityDistribution[risk.risk_severity] =
          (vendorRiskSeverityDistribution[risk.risk_severity] || 0) + 1;
      }
    });

    return {
      reviewStatusDistribution,
      dataSensitivityDistribution,
      businessCriticalityDistribution,
      regulatoryExposureDistribution,
      riskScoreDistribution,
      vendorRiskSeverityDistribution,
      totalVendors,
      totalVendorRisks,
    };
  } catch (error) {
    logger.error("Error getting vendor analytics:", error);
    throw new Error(
      `Failed to get vendor analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface VendorExecutiveSummary {
  totalVendors: number;
  reviewedVendors: number;
  pendingReviewVendors: number;
  highRiskVendors: number;
  criticalBusinessVendors: number;
  vendorsWithPII: number;
  vendorsRequiringFollowUp: number;
  totalVendorRisks: number;
  majorOrCatastrophicRisks: number;
  topRegulations: Array<{
    regulation: string;
    count: number;
  }>;
  vendorsNeedingAttention: Array<{
    id: number;
    vendor_name: string;
    review_status: string;
    risk_score: number | undefined;
    business_criticality: string | undefined;
  }>;
  reviewProgress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

const getVendorExecutiveSummary = async (
  _params: Record<string, never>,
  organizationId: number,
): Promise<VendorExecutiveSummary> => {
  try {
    const vendors = await getAllVendorsQuery(organizationId);
    const vendorRisks = await getAllVendorRisksAllProjectsQuery(organizationId, "active") as IVendorRisk[];

    const totalVendors = vendors.length;

    // Count by review status
    const reviewedVendors = vendors.filter(
      (v) => v.review_status === "Reviewed",
    ).length;

    const pendingReviewVendors = vendors.filter(
      (v) => !v.review_status || v.review_status === "Not started" || v.review_status === "In review",
    ).length;

    const vendorsRequiringFollowUp = vendors.filter(
      (v) => v.review_status === "Requires follow-up",
    ).length;

    // High risk vendors (risk_score > 70)
    const highRiskVendors = vendors.filter(
      (v) => v.risk_score !== undefined && v.risk_score > 70,
    ).length;

    // Critical business vendors
    const criticalBusinessVendors = vendors.filter(
      (v) => v.business_criticality === "High (critical to core services or products)",
    ).length;

    // Vendors handling PII
    const vendorsWithPII = vendors.filter(
      (v) => v.data_sensitivity === "Personally identifiable information (PII)",
    ).length;

    // Vendor risks
    const totalVendorRisks = vendorRisks.length;
    const majorOrCatastrophicRisks = vendorRisks.filter(
      (r) => r.risk_severity === "Major" || r.risk_severity === "Catastrophic",
    ).length;

    // Top regulations
    const regulatoryMap = new Map<string, number>();
    vendors.forEach((vendor) => {
      if (vendor.regulatory_exposure && vendor.regulatory_exposure !== "None") {
        regulatoryMap.set(
          vendor.regulatory_exposure,
          (regulatoryMap.get(vendor.regulatory_exposure) || 0) + 1,
        );
      }
    });

    const topRegulations = Array.from(regulatoryMap.entries())
      .map(([regulation, count]) => ({ regulation, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Vendors needing attention (high risk or requiring follow-up)
    const vendorsNeedingAttention = vendors
      .filter(
        (v) =>
          v.review_status === "Requires follow-up" ||
          (v.risk_score !== undefined && v.risk_score > 70) ||
          v.business_criticality === "High (critical to core services or products)",
      )
      .map((v) => ({
        id: v.id || 0,
        vendor_name: v.vendor_name,
        review_status: v.review_status || "Not started",
        risk_score: v.risk_score,
        business_criticality: v.business_criticality,
      }))
      .slice(0, 5);

    // Review progress
    const reviewProgress = {
      completed: reviewedVendors,
      total: totalVendors,
      percentage:
        totalVendors > 0 ? Math.round((reviewedVendors / totalVendors) * 100) : 0,
    };

    return {
      totalVendors,
      reviewedVendors,
      pendingReviewVendors,
      highRiskVendors,
      criticalBusinessVendors,
      vendorsWithPII,
      vendorsRequiringFollowUp,
      totalVendorRisks,
      majorOrCatastrophicRisks,
      topRegulations,
      vendorsNeedingAttention,
      reviewProgress,
    };
  } catch (error) {
    logger.error("Error getting vendor executive summary:", error);
    throw new Error(
      `Failed to get vendor executive summary: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const availableVendorTools: any = {
  fetch_vendors: fetchVendors,
  fetch_vendor_risks: fetchVendorRisks,
  get_vendor_analytics: getVendorAnalytics,
  get_vendor_executive_summary: getVendorExecutiveSummary,
};

export { availableVendorTools };
