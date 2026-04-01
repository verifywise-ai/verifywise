import { BarChart3, Filter, Search, FilePlus } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const PolicySteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="add-policy-button"]',
    content: {
      header: "Create new policies",
      body: "Draft new governance policies aligned with regulatory requirements. Use templates and best practices to ensure comprehensive coverage.",
      icon: <FilePlus size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
  {
    target: '[data-joyride-id="policy-status-cards"]',
    content: {
      header: "Policy status overview",
      body: "Monitor your policies at a glance by status: Draft, Under Review, Approved, Published, Archived, and Deprecated.",
      icon: <BarChart3 size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="policy-status-filter"]',
    content: {
      header: "Filter by Status",
      body: "Quickly filter policies by their current approval and lifecycle status to focus on what needs your attention.",
      icon: <Filter size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="policy-search"]',
    content: {
      header: "Search policies",
      body: "Find specific policies quickly by searching titles or keywords. Perfect for large policy libraries.",
      icon: <Search size={20} color={background.main} />,
    },
    placement: "bottom",
  },
];

export default PolicySteps;
