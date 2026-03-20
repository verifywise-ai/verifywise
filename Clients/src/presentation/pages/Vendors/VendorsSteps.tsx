import { CirclePlus, AlertTriangle } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const VendorsSteps: IPageTourStep[] = [
  // Vendors list tab
  {
    target: '[data-joyride-id="add-new-vendor"]',
    content: {
      header: "Add new vendor",
      body: "Register external AI providers and third-party services. Document vendor information, contracts, and compliance requirements in one centralized location.",
      icon: <CirclePlus size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
  // Vendor risks tab
  {
    target: '[data-joyride-id="add-vendor-risk-button"]',
    content: {
      header: "Add vendor risk",
      body: "Document and track risks associated with your vendors. Assess severity, assign owners, and define mitigation strategies for each vendor-related risk.",
      icon: <AlertTriangle size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
];

export default VendorsSteps;
