import { FolderPlus } from "lucide-react";
import { IPageTourStep } from "../../../types/interfaces/i.tour";
import { background } from "../../../themes/palette";

const HomeSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="new-project-button"]',
    content: {
      header: "Create your first project",
      body: "Start by creating a project that represents an AI activity or system in your organization. Each project helps you manage compliance, assessments, and vendor relationships.",
      icon: <FolderPlus size={20} color={background.main} />,
    },
  },
];

export default HomeSteps;
