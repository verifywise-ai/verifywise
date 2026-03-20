import { BarChart3, Filter, AlertTriangle } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const RiskManagementSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="add-risk-button"]',
    content: {
      header: "Add new risks",
      body: "Create custom risks specific to your AI projects, or import industry-standard risks from IBM or MIT AI Risk Databases. Assess severity, assign owners, and define mitigation strategies.",
      icon: <AlertTriangle size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
  {
    target: '[data-joyride-id="risk-summary-cards"]',
    content: {
      header: "Risk distribution overview",
      body: "View your risk landscape across all AI projects by severity level: Very High, High, Medium, Low, and Very Low. Quickly identify which risks need immediate attention.",
      icon: <BarChart3 size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="risk-filters"]',
    content: {
      header: "Advanced risk filtering",
      body: "Filter risks by category, severity level, likelihood, mitigation status, and deletion status. Combine filters to find exactly what you're looking for.",
      icon: <Filter size={20} color={background.main} />,
    },
    placement: "bottom",
  },
];

export default RiskManagementSteps;
