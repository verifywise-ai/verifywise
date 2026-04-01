import { TrendingUp, FolderTree } from "lucide-react";
import { IPageTourStep } from "../../../types/interfaces/i.tour";
import { background } from "../../../themes/palette";

const ComplianceSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="compliance-progress-bar"]',
    content: {
      header: "Track your progress",
      body: "Monitor your overall compliance status at a glance. The progress bar shows how many controls have been completed and what still needs attention.",
      icon: <TrendingUp size={20} color={background.main} />,
    },
    placement: "left",
  },
  {
    target: '[data-joyride-id="control-groups"]',
    content: {
      header: "Control groups",
      body: "Controls are organized into logical groups and subcontrols for easier navigation. Complete each control to improve your compliance statistics and track progress by category.",
      icon: <FolderTree size={20} color={background.main} />,
    },
    placement: "left",
  },
];

export default ComplianceSteps;
