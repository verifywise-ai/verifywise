import { Layout, AlertTriangle, BarChart3, FileText } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const ProjectViewSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="project-tabs"]',
    content: {
      header: "Navigate project sections",
      body: "Switch between project overview, use case risks, and settings. Each tab provides detailed information and management capabilities for your AI use case.",
      icon: <Layout size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="framework-progress"]',
    content: {
      header: "Framework compliance",
      body: "Track your progress implementing compliance frameworks like ISO 42001. Monitor clause completion and identify gaps in your governance process.",
      icon: <BarChart3 size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="risk-summary"]',
    content: {
      header: "Risk overview",
      body: "View risk distribution across severity levels. Identify high-priority risks requiring immediate attention and mitigation.",
      icon: <AlertTriangle size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="project-assessments"]',
    content: {
      header: "Assessments and evidence",
      body: "Access completed assessments, linked policies, and uploaded evidence files. Maintain comprehensive documentation for audit readiness.",
      icon: <FileText size={20} color={background.main} />,
    },
    placement: "bottom",
  },
];

export default ProjectViewSteps;
