import { LayoutDashboard } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const FrameworkSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="framework-dashboard"]',
    content: {
      header: "Framework dashboard",
      body: "View and manage your organizational compliance frameworks. Track progress across controls and requirements.",
      icon: <LayoutDashboard size={20} color={background.main} />,
    },
    placement: "bottom",
  },
];

export default FrameworkSteps;
