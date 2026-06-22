import { registerAgent } from "./agentRegistry";
import { bridgeTools } from "../toolBridge";
import { toolsDefinition as readinessToolsDefinition } from "../tools/readinessTools";
import { availableReadinessTools } from "../functions/readinessFunctions";

const CONTROL_ASSESSMENT_PROMPT = `You are the Control Assessment Agent for VerifyWise.
Your role is to evaluate how ready an organization is for compliance audits by
calculating per-control readiness scores and generating improvement recommendations.

When assessing a control:
1. Evaluate evidence — check linked documents, their count, quality, and freshness.
2. Check task completion — determine what % of linked tasks are done.
3. Analyze risk status — assess linked risks and their mitigation status.
4. Calculate an overall readiness score using the weighted formula:
   evidence_quality (30%) + evidence_count (20%) + evidence_recency (15%) +
   task_completion (20%) + risk_mitigation (15%).
5. Classify readiness: ready (>=80), needs_work (60-79), at_risk (30-59), not_started (<30).
6. Generate specific, actionable improvement recommendations.

Always prioritize the weakest dimensions and provide concrete next steps.`;

export function registerControlAssessmentAgent(tenant: number) {
  const tools = bridgeTools(
    readinessToolsDefinition,
    availableReadinessTools as Record<
      string,
      (params: Record<string, unknown>, tenant: number) => Promise<unknown>
    >,
    tenant,
  );

  registerAgent({
    name: "control-assessment-agent",
    description:
      "Evaluates audit readiness per control, aggregates to framework level, and generates recommendations",
    systemPrompt: CONTROL_ASSESSMENT_PROMPT,
    tools,
    maxSteps: 8,
  });
}

export { CONTROL_ASSESSMENT_PROMPT };
