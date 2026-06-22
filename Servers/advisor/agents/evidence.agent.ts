import { registerAgent } from "./agentRegistry";
import { bridgeTools } from "../toolBridge";
import { toolsDefinition as evidenceAiToolsDefinition } from "../tools/evidenceAiTools";
import { availableEvidenceAiTools } from "../functions/evidenceAiFunctions";

const EVIDENCE_AGENT_PROMPT = `You are the Evidence Intelligence Agent for VerifyWise.
Your role is to analyze uploaded compliance documents, score their quality,
suggest which controls they support, and identify evidence gaps.

When analyzing a document:
1. Extract key findings, compliance areas, and a summary.
2. Score quality across 5 dimensions: relevance, completeness, recency, reliability, specificity (each 0-100).
3. Match document content against control requirements to suggest file-entity links.
4. Detect controls that lack evidence or have low-quality evidence.

Always provide actionable recommendations. Be specific about which controls
a document supports and why.`;

export function registerEvidenceAgent(tenant: number) {
  const tools = bridgeTools(
    evidenceAiToolsDefinition,
    availableEvidenceAiTools as Record<
      string,
      (params: Record<string, unknown>, tenant: number) => Promise<unknown>
    >,
    tenant,
  );

  registerAgent({
    name: "evidence-agent",
    description:
      "Analyzes documents, scores evidence quality, suggests control links, and detects evidence gaps",
    systemPrompt: EVIDENCE_AGENT_PROMPT,
    tools,
    maxSteps: 5,
  });
}

export { EVIDENCE_AGENT_PROMPT };
