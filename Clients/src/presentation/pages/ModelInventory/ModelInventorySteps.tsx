import { BarChart3, Filter, Search, PlusCircle, AlertTriangle, FileText } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const ModelInventorySteps: IPageTourStep[] = [
  // Model inventory tab
  {
    target: '[data-joyride-id="add-model-button"]',
    content: {
      header: "Register new models",
      body: "Add new AI models to your inventory with comprehensive metadata including provider, version, capabilities, security assessment, and usage details.",
      icon: <PlusCircle size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
  {
    target: '[data-joyride-id="model-summary-cards"]',
    content: {
      header: "Model status summary",
      body: "Track your AI models by approval status at a glance: Approved, Restricted, Pending, and Blocked.",
      icon: <BarChart3 size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="model-status-filter"]',
    content: {
      header: "Filter by approval status",
      body: "Focus on models that need attention by filtering by approval status. Quickly identify pending approvals or restricted models.",
      icon: <Filter size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="model-search"]',
    content: {
      header: "Search models",
      body: "Search your model inventory by model name, provider, or version to quickly locate specific AI models in your registry.",
      icon: <Search size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  // Model risks tab
  {
    target: '[data-joyride-id="add-model-risk-button"]',
    content: {
      header: "Add model risk",
      body: "Document risks specific to your AI models. Track risk severity, assign owners, and define mitigation strategies.",
      icon: <AlertTriangle size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
  // Evidence hub tab
  {
    target: '[data-joyride-id="evidence-type-filter"]',
    content: {
      header: "Filter evidence",
      body: "Filter evidence files by type to quickly find compliance documentation, assessments, and audit artifacts.",
      icon: <FileText size={20} color={background.main} />,
    },
    placement: "bottom",
  },
];

export default ModelInventorySteps;
