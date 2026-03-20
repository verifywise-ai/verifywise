import { IStatusData } from "../types/interfaces/i.chart";
import { status, risk, text } from "../themes/palette";

// Color schemes for different entity statuses
export const statusColorSchemes = {
  // Model statuses (4 different states)
  models: {
    development: status.info.text,
    training: status.warning.text,
    validation: "#8B5CF6",
    production: status.success.text,
  },

  // Vendor statuses
  vendors: {
    "in review": status.warning.text,
    reviewed: status.success.text,
    "requires follow up": status.error.text,
    active: status.success.text,
    inactive: status.default.text,
  },

  // Policy statuses
  policies: {
    draft: status.default.text,
    "in review": status.warning.text,
    approved: status.success.text,
    published: status.info.text,
    archived: text.disabled,
  },

  // Training statuses
  trainings: {
    planned: status.default.text,
    "in progress": status.warning.text,
    completed: status.success.text,
  },

  // Vendor risk levels
  vendorRisks: {
    "very high": risk.critical.text,
    high: risk.high.text,
    medium: risk.medium.text,
    low: risk.low.text,
    "very low": risk.veryLow.text,
  },

  // Incident statuses
  incidents: {
    open: status.error.text,
    "in progress": status.warning.text,
    resolved: status.success.text,
    closed: status.default.text,
  },
};

// Helper function to get color for a status
export const getStatusColor = (
  entityType: keyof typeof statusColorSchemes,
  statusName: string
): string => {
  const scheme = statusColorSchemes[entityType];
  const normalizedStatus = statusName.toLowerCase().trim();
  return scheme[normalizedStatus as keyof typeof scheme] || status.default.text;
};

// Helper function to create StatusData array from status counts
export const createStatusData = (
  entityType: keyof typeof statusColorSchemes,
  statusCounts: Record<string, number>
): IStatusData[] => {
  return Object.entries(statusCounts).map(([statusName, count]) => ({
    label: statusName,
    value: count,
    color: getStatusColor(entityType, statusName),
  }));
};

// Default status distributions (when API doesn't provide breakdown)
export const getDefaultStatusDistribution = (
  entityType: keyof typeof statusColorSchemes,
  total: number
): IStatusData[] => {
  if (total === 0) return [];

  switch (entityType) {
    case "models":
      return [
        {
          label: "Production",
          value: Math.floor(total * 0.4),
          color: statusColorSchemes.models.production,
        },
        {
          label: "Development",
          value: Math.floor(total * 0.3),
          color: statusColorSchemes.models.development,
        },
        {
          label: "Training",
          value: Math.floor(total * 0.2),
          color: statusColorSchemes.models.training,
        },
        {
          label: "Validation",
          value: total - Math.floor(total * 0.9),
          color: statusColorSchemes.models.validation,
        },
      ];

    case "trainings":
      return [
        {
          label: "Completed",
          value: Math.floor(total * 0.6),
          color: statusColorSchemes.trainings.completed,
        },
        {
          label: "In Progress",
          value: Math.floor(total * 0.25),
          color: statusColorSchemes.trainings["in progress"],
        },
        {
          label: "Planned",
          value: total - Math.floor(total * 0.85),
          color: statusColorSchemes.trainings.planned,
        },
      ];

    case "policies":
      return [
        {
          label: "Published",
          value: Math.floor(total * 0.5),
          color: statusColorSchemes.policies.published,
        },
        {
          label: "Approved",
          value: Math.floor(total * 0.25),
          color: statusColorSchemes.policies.approved,
        },
        {
          label: "In Review",
          value: Math.floor(total * 0.15),
          color: statusColorSchemes.policies["in review"],
        },
        {
          label: "Draft",
          value: total - Math.floor(total * 0.9),
          color: statusColorSchemes.policies.draft,
        },
      ];

    case "vendors":
      return [
        {
          label: "Active",
          value: Math.floor(total * 0.7),
          color: statusColorSchemes.vendors.active,
        },
        {
          label: "In Review",
          value: Math.floor(total * 0.2),
          color: statusColorSchemes.vendors["in review"],
        },
        {
          label: "Requires Follow Up",
          value: total - Math.floor(total * 0.9),
          color: statusColorSchemes.vendors["requires follow up"],
        },
      ];

    case "vendorRisks":
      return [
        {
          label: "Low",
          value: Math.floor(total * 0.4),
          color: statusColorSchemes.vendorRisks.low,
        },
        {
          label: "Medium",
          value: Math.floor(total * 0.35),
          color: statusColorSchemes.vendorRisks.medium,
        },
        {
          label: "High",
          value: Math.floor(total * 0.2),
          color: statusColorSchemes.vendorRisks.high,
        },
        {
          label: "Very High",
          value: total - Math.floor(total * 0.95),
          color: statusColorSchemes.vendorRisks["very high"],
        },
      ];

    case "incidents":
      return [
        {
          label: "Open",
          value: Math.floor(total * 0.3),
          color: statusColorSchemes.incidents.open,
        },
        {
          label: "In Progress",
          value: Math.floor(total * 0.4),
          color: statusColorSchemes.incidents["in progress"],
        },
        {
          label: "Resolved",
          value: Math.floor(total * 0.2),
          color: statusColorSchemes.incidents.resolved,
        },
        {
          label: "Closed",
          value: total - Math.floor(total * 0.9),
          color: statusColorSchemes.incidents.closed,
        },
      ];

    default:
      return [];
  }
};
