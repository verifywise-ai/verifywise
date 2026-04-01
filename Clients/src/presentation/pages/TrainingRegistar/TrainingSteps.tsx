import { CirclePlus } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const TrainingSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="add-training-button"]',
    content: {
      header: "Add new training",
      body: "Register AI-related training programs and educational resources. Track completion status, certifications, and learning progress across your team.",
      icon: <CirclePlus size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
];

export default TrainingSteps;
