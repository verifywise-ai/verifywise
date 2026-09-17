import { IStatusData } from "../types/interfaces/i.chart";

// Generate distribution summary text
export const getDistributionSummary = (statusData: IStatusData[]): string => {
  if (!statusData || statusData.length === 0) return "";

  // Sort by value descending and take top 2-3 most significant
  const significantStatuses = statusData
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  if (significantStatuses.length === 0) return "";

  return significantStatuses.map((status) => `${status.value} ${status.label}`).join(", ");
};

// Generate quick stats based on entity type and data
export const getQuickStats = (
  entityType:
    | "models"
    | "vendors"
    | "policies"
    | "trainings"
    | "vendorRisks"
    | "incidents"
    | undefined,
  total: number,
  statusData?: IStatusData[],
): string => {
  if (!entityType || total === 0) return "";

  switch (entityType) {
    case "models": {
      const productionModels =
        statusData?.find((s) => s.label.toLowerCase().includes("production"))?.value ||
        Math.floor(total * 0.4);
      return `${productionModels} in production`;
    }

    case "trainings": {
      const completedTrainings =
        statusData?.find((s) => s.label.toLowerCase().includes("completed"))?.value ||
        Math.floor(total * 0.6);
      const completionRate = Math.round((completedTrainings / total) * 100);
      return `${completionRate}% completion rate`;
    }

    case "policies": {
      const publishedPolicies =
        statusData?.find((s) => s.label.toLowerCase().includes("published"))?.value ||
        Math.floor(total * 0.5);
      return `${publishedPolicies} published`;
    }

    case "vendors": {
      const activeVendors =
        statusData?.find((s) => s.label.toLowerCase().includes("active"))?.value ||
        Math.floor(total * 0.7);
      return `${activeVendors} active`;
    }

    case "vendorRisks": {
      const highRisks =
        statusData
          ?.filter(
            (s) =>
              s.label.toLowerCase().includes("high") && !s.label.toLowerCase().includes("very"),
          )
          ?.reduce((sum, item) => sum + item.value, 0) || Math.floor(total * 0.2);
      const veryHighRisks =
        statusData?.find((s) => s.label.toLowerCase().includes("very high"))?.value ||
        Math.floor(total * 0.05);
      const criticalCount = highRisks + veryHighRisks;
      return criticalCount > 0 ? `${criticalCount} require attention` : "All risks managed";
    }

    case "incidents": {
      const openIncidents =
        statusData?.find((s) => s.label.toLowerCase().includes("open"))?.value ||
        Math.floor(total * 0.3);
      return openIncidents > 0 ? `${openIncidents} open` : "All resolved";
    }

    default:
      return "";
  }
};

// Determine if entity has critical items requiring quick actions
export const hasCriticalItems = (
  entityType:
    | "models"
    | "vendors"
    | "policies"
    | "trainings"
    | "vendorRisks"
    | "incidents"
    | undefined,
  statusData?: IStatusData[],
): { hasCritical: boolean; actionLabel: string; actionRoute: string } => {
  if (!entityType || !statusData) {
    return { hasCritical: false, actionLabel: "", actionRoute: "" };
  }

  switch (entityType) {
    case "vendorRisks": {
      const highRisk = statusData.find((s) => s.label.toLowerCase().includes("high"))?.value || 0;
      const veryHighRisk =
        statusData.find((s) => s.label.toLowerCase().includes("very high"))?.value || 0;
      const criticalRisks = highRisk + veryHighRisk;

      return {
        hasCritical: criticalRisks > 0,
        actionLabel: `View ${criticalRisks} High Risk`,
        actionRoute: "/vendors?filter=high-risk",
      };
    }

    case "policies": {
      const inReview =
        statusData.find((s) => s.label.toLowerCase().includes("in review"))?.value || 0;
      const draft = statusData.find((s) => s.label.toLowerCase().includes("draft"))?.value || 0;
      const needsAttention = inReview + draft;

      return {
        hasCritical: needsAttention > 0,
        actionLabel: `Review ${needsAttention} Policies`,
        actionRoute: "/policies?filter=needs-review",
      };
    }

    case "trainings": {
      const inProgress =
        statusData.find((s) => s.label.toLowerCase().includes("in progress"))?.value || 0;

      return {
        hasCritical: inProgress > 0,
        actionLabel: `Track ${inProgress} Active`,
        actionRoute: "/training?filter=in-progress",
      };
    }

    case "vendors": {
      const requiresFollowUp =
        statusData.find((s) => s.label.toLowerCase().includes("follow up"))?.value || 0;

      return {
        hasCritical: requiresFollowUp > 0,
        actionLabel: `Follow up ${requiresFollowUp}`,
        actionRoute: "/vendors?filter=follow-up",
      };
    }

    case "incidents": {
      const openIncidents =
        statusData.find((s) => s.label.toLowerCase().includes("open"))?.value || 0;

      return {
        hasCritical: openIncidents > 0,
        actionLabel: `Resolve ${openIncidents} Open`,
        actionRoute: "/ai-incident-managements?filter=open",
      };
    }

    default:
      return { hasCritical: false, actionLabel: "", actionRoute: "" };
  }
};

// Determine priority visual cues
export const getPriorityLevel = (
  entityType:
    | "models"
    | "vendors"
    | "policies"
    | "trainings"
    | "vendorRisks"
    | "incidents"
    | undefined,
  total: number,
  statusData?: IStatusData[],
): "none" | "medium" | "high" => {
  if (!entityType || total === 0) return "none";

  switch (entityType) {
    case "vendorRisks": {
      const veryHighRisk =
        statusData?.find((s) => s.label.toLowerCase().includes("very high"))?.value || 0;
      const highRisk =
        statusData?.find(
          (s) => s.label.toLowerCase().includes("high") && !s.label.toLowerCase().includes("very"),
        )?.value || 0;

      if (veryHighRisk > 0) return "high";
      if (highRisk > 0) return "medium";
      return "none";
    }

    case "policies": {
      const overdue = statusData?.find((s) => s.label.toLowerCase().includes("draft"))?.value || 0;
      const draftPercentage = (overdue / total) * 100;

      if (draftPercentage > 30) return "high";
      if (draftPercentage > 10) return "medium";
      return "none";
    }

    case "trainings": {
      const completed =
        statusData?.find((s) => s.label.toLowerCase().includes("completed"))?.value || 0;
      const completionRate = (completed / total) * 100;

      if (completionRate < 50) return "high";
      if (completionRate < 75) return "medium";
      return "none";
    }

    case "incidents": {
      const openIncidents =
        statusData?.find((s) => s.label.toLowerCase().includes("open"))?.value || 0;
      const openPercentage = (openIncidents / total) * 100;

      if (openPercentage > 50) return "high";
      if (openPercentage > 20) return "medium";
      return "none";
    }

    default:
      return "none";
  }
};
