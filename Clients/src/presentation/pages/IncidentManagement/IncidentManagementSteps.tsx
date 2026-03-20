import { BarChart3, AlertCircle, Search } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const IncidentManagementSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="add-incident-button"]',
    content: {
      header: "Log new incidents",
      body: "Document AI-related incidents with full details including severity, impact assessment, affected parties, immediate mitigations, and planned corrective actions.",
      icon: <AlertCircle size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
  {
    target: '[data-joyride-id="incident-status-cards"]',
    content: {
      header: "Incident lifecycle overview",
      body: "Monitor incidents across their lifecycle: Open, Investigating, Mitigated, and Closed. Track resolution progress and identify incidents requiring immediate attention.",
      icon: <BarChart3 size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="incident-search"]',
    content: {
      header: "Search incidents",
      body: "Quickly find specific incidents by searching titles or descriptions. Perfect for locating incidents in large lists.",
      icon: <Search size={20} color={background.main} />,
    },
    placement: "bottom",
  },
];

export default IncidentManagementSteps;
