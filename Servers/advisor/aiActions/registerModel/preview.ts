import type { AgentRegisterModelInput } from "./schema";

export function renderRegisterModelPreview(input: AgentRegisterModelInput): string {
  const provider = input.model_type ? ` from ${input.model_type}` : "";
  const version = input.version ? ` (v${input.version})` : "";
  const project = input.project_id ? ` linked to project #${input.project_id}` : "";
  return `Register model "${input.name}"${provider}${version}${project}`;
}
