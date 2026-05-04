import { IVendorRisk } from "../../interfaces/i.vendorRisk";

// Sample mock data for VendorRisk
const mockVendorRisks = (
  vendor1: number,
  vendor2: number,
  vendor3: number,
  vendor4: number,
  userId1: number,
  userId2: number,
): IVendorRisk[] => {
  return [
    {
      id: 1,
      vendor_id: vendor1,
      order_no: 1,
      risk_description: "Data Security",
      impact_description: "Alice",
      // impact: "Critical",
      likelihood: "Almost certain",
      risk_severity: "Catastrophic",
      action_plan: "Vendor Risk 1 action plan",
      action_owner: userId1,
      risk_level: "High risk",
    },
    {
      id: 2,
      vendor_id: vendor2,
      order_no: 1,
      risk_description: "Service Reliability",
      impact_description: "Bob",
      // impact: "Major",
      likelihood: "Likely",
      risk_severity: "Moderate",
      action_plan: "Vendor Risk 2 action plan",
      action_owner: userId1,
      risk_level: "Medium risk",
    },
    {
      id: 3,
      vendor_id: vendor3,
      order_no: 1,
      risk_description: "Compliance Risk",
      impact_description: "Charlie",
      // impact: "Moderate",
      likelihood: "Possible",
      risk_severity: "Catastrophic",
      action_plan: "Vendor Risk 3 action plan",
      action_owner: userId2,
      risk_level: "Low risk",
    },
    {
      id: 4,
      vendor_id: vendor4,
      order_no: 1,
      risk_description: "Network Vulnerability",
      impact_description: "David",
      // impact: "Moderate",
      likelihood: "Rare",
      risk_severity: "Negligible",
      action_plan: "Vendor Risk 4 action plan",
      action_owner: userId2,
      risk_level: "Very high risk",
    },
  ];
};

// Export the mock data for use in other files
export default mockVendorRisks;
