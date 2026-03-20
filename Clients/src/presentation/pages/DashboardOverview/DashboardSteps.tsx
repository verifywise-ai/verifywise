import { Plus, BarChart3 } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const DashboardSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="dashboard-stats"]',
    content: {
      header: "Quick stats overview",
      body: "Monitor your AI governance metrics at a glance. View counts for models, vendors, policies, trainings, and incidents. Click any card to navigate to its detailed view.",
      icon: <BarChart3 size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="add-new-dropdown"]',
    content: {
      header: "Quick add menu",
      body: "Quickly create new use cases, vendors, models, risks, or policies without navigating to different pages. Your shortcuts to common actions.",
      icon: <Plus size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
];

export default DashboardSteps;
