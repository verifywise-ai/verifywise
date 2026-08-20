/**
 * jira-assets constants — declarative catalog of the VerifyWise AI System
 * attributes that JIRA-side attributes can be mapped into, plus a helper to
 * flatten the nested JIRA attribute shape into a plain key/value map.
 */

export interface VwAiSystemAttribute {
  name: string;
  type: string;
  defaultTypeId?: number;
  description: string;
  options?: string;
  uniqueAttribute?: boolean;
}

export const VW_AI_SYSTEM_ATTRIBUTES: VwAiSystemAttribute[] = [
  {
    name: "System Name / Identifier",
    type: "0",
    defaultTypeId: 0,
    description: "Unique identifier",
    uniqueAttribute: true,
  },
  {
    name: "Description / Purpose",
    type: "0",
    defaultTypeId: 9,
    description: "Overview of objectives and business value",
  },
  {
    name: "Last Release Date",
    type: "0",
    defaultTypeId: 4,
    description: "Current version and release date",
  },
  {
    name: "Business Owner / Responsible Team",
    type: "2",
    description: "Accountable business function",
  },
  {
    name: "Technical Owner / Maintainer",
    type: "2",
    description: "Role/team maintaining models and runtime",
  },
  { name: "AI Officer", type: "2", description: "Named role for AIMS governance" },
  {
    name: "Model Owner / Maintainer",
    type: "2",
    description: "Accountable role for model artefacts",
  },
  { name: "Risk Owner", type: "2", description: "Named accountable person for residual risk" },
  {
    name: "Vendor / Developer Name (if third-party)",
    type: "0",
    defaultTypeId: 0,
    description: "Company providing the model/tool",
  },
  {
    name: "Lifecycle Status",
    type: "0",
    defaultTypeId: 10,
    description: "Current stage in lifecycle",
    options: "concept,prototype,pilot,production,retired",
  },
  {
    name: "Primary Function",
    type: "0",
    defaultTypeId: 10,
    description: "Model task taxonomy",
    options:
      "prediction,classification,recommendation,generation,clustering,anomaly_detection,optimization,other",
  },
  {
    name: "Use Case / Business Process Supported",
    type: "0",
    defaultTypeId: 9,
    description: "Specific process(es) where AI is embedded",
  },
  {
    name: "User Groups / Stakeholders",
    type: "0",
    defaultTypeId: 9,
    description: "Intended users and affected parties",
  },
  {
    name: "Decision Type",
    type: "0",
    defaultTypeId: 10,
    description: "Degree of automation",
    options: "automated,decision_support,human_in_the_loop,human_on_the_loop",
  },
  {
    name: "AI Function Type",
    type: "0",
    defaultTypeId: 10,
    description: "Model family",
    options: "machine_learning,deep_learning,rules_based,generative_ai,hybrid,other",
  },
  {
    name: "Input Data Sources & Types",
    type: "0",
    defaultTypeId: 9,
    description: "Data sources and classifications",
  },
  {
    name: "Contains Personal / Sensitive Data",
    type: "0",
    defaultTypeId: 2,
    description: "Indicator of personal/sensitive data",
  },
  {
    name: "Risk Level / Criticality",
    type: "0",
    defaultTypeId: 10,
    description: "Overall risk classification",
    options: "low,medium,high,critical",
  },
  {
    name: "Potential Harms or Impacts",
    type: "0",
    defaultTypeId: 9,
    description: "Documented harms and affected stakeholders",
  },
  {
    name: "Known Limitations",
    type: "0",
    defaultTypeId: 9,
    description: "Known failure modes and scope limits",
  },
  {
    name: "Applicable Regulations",
    type: "0",
    defaultTypeId: 9,
    description: "Regulatory frameworks - GDPR, EU AI Act, etc.",
  },
  {
    name: "Deployment Environment",
    type: "0",
    defaultTypeId: 10,
    description: "Runtime environment",
    options: "cloud,on_premises,hybrid,edge",
  },
  {
    name: "Platform / Tooling",
    type: "0",
    defaultTypeId: 9,
    description: "Managed platforms and MLOps tools",
  },
  {
    name: "Model Type / Algorithm & Version",
    type: "0",
    defaultTypeId: 0,
    description: "Algorithm family and version",
  },
  {
    name: "Key Performance Metrics",
    type: "0",
    defaultTypeId: 9,
    description: "Primary KPIs with thresholds",
  },
  {
    name: "Explainability Method",
    type: "0",
    defaultTypeId: 10,
    description: "Explainability techniques",
    options: "shap,lime,attention_weights,feature_importance,counterfactuals,none,other",
  },
  {
    name: "Human Oversight Mechanisms",
    type: "0",
    defaultTypeId: 9,
    description: "HITL triggers and escalation paths",
  },
  {
    name: "Go-Live Date",
    type: "0",
    defaultTypeId: 4,
    description: "First production deployment date",
  },
  {
    name: "Documentation Links",
    type: "0",
    defaultTypeId: 7,
    description: "Links to model cards, data sheets",
  },
  {
    name: "Notes & Comments",
    type: "0",
    defaultTypeId: 9,
    description: "Free-text governance notes",
  },
];

/**
 * JIRA attribute rows are `{objectTypeAttributeId, objectAttributeValues: [{value, displayValue}]}`
 * with an optional pre-resolved `attrIdToName` map (populated by JiraAssetsClient.getObjects).
 * Flatten to `{ [attrName]: value | value[] }`.
 */
export function transformAttributes(
  attributes: any,
  attrIdToName?: Record<string, string>,
): Record<string, any> {
  const result: Record<string, any> = {};
  if (!Array.isArray(attributes)) return result;
  for (const attr of attributes) {
    const attrId = attr.objectTypeAttributeId || attr.id;
    const name =
      attr.objectTypeAttribute?.name ||
      (attrIdToName && attrId ? attrIdToName[attrId] : null) ||
      attr.name ||
      attrId;
    if (!name) continue;
    const values = attr.objectAttributeValues || attr.values || [];
    if (!Array.isArray(values) || values.length === 0) {
      result[name] = attr.value || attr.displayValue || null;
    } else if (values.length === 1) {
      result[name] = values[0].displayValue || values[0].value;
    } else {
      result[name] = values.map((v: any) => v.displayValue || v.value);
    }
  }
  return result;
}
