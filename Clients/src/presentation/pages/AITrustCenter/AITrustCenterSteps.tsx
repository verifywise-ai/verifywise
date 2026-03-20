import { Eye, Layout, FileText } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const AITrustCenterSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="trust-center-tabs"]',
    content: {
      header: "Navigate trust center",
      body: "Explore different sections of your public trust center. Switch between Overview, Resources, Subprocessors, and Settings to customize each aspect.",
      icon: <Layout size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="preview-mode-button"]',
    content: {
      header: "Preview public view",
      body: "See exactly how your AI Trust Center appears to external visitors, stakeholders, and customers before publishing.",
      icon: <Eye size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
  {
    target: '[data-joyride-id="trust-center-overview"]',
    content: {
      header: "Trust center overview",
      body: "Customize your public-facing AI governance information. Add your organization's AI principles, compliance certifications, and transparency commitments.",
      icon: <FileText size={20} color={background.main} />,
    },
    placement: "top",
  },
];

export default AITrustCenterSteps;
