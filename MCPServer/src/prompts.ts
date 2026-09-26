/**
 * MCP prompts, which Claude Code surfaces as slash commands.
 *
 * A prompt only returns instructions — it cannot store anything itself, so the
 * login flow ends in a call to the add_deployment tool.
 */

import { z } from "zod";
import { configPath } from "./config.js";

export interface PromptDef {
  name: string;
  title: string;
  description: string;
  argsSchema: z.ZodRawShape;
  build: (args: Record<string, string | undefined>) => string;
}

const login: PromptDef = {
  name: "login",
  title: "Connect a VerifyWise deployment",
  description: "Sign in to a VerifyWise deployment with an API token so the tools can use it.",
  argsSchema: {
    url: z.string().optional().describe("Deployment URL, for example https://acme.verifywise.ai"),
    token: z.string().optional().describe("API token for that deployment."),
  },
  build: ({ url, token }) =>
    [
      "Connect a VerifyWise deployment so the VerifyWise tools can use it.",
      "",
      url && token
        ? `Call the add_deployment tool now with url "${url}" and the token I gave you.`
        : [
            "I still need to give you:",
            url ? `- Deployment URL: ${url}` : "- The deployment URL",
            token ? "- The API token (given)" : "- An API token for it",
            "",
            "Ask me for what is missing, in one message, then call add_deployment.",
            "For the token: sign in to the deployment, then Settings \u2192 API keys \u2192 create.",
            "Its user has to be an Admin of an organization or a super admin, and the raw",
            "token is shown only once.",
          ].join("\n"),
      "",
      "Do not pass a name \u2014 add_deployment derives one from the URL host.",
      `It checks the token against the deployment before saving it to ${configPath()}.`,
      "",
      "Do not investigate this project, read its config, or infer values: the URL and",
      "token come from me and nowhere else. If add_deployment fails, tell me what it",
      "said \u2014 do not retry with a guess.",
      "",
      "When it succeeds, tell me the profile name it saved.",
    ].join("\n"),
};

export const prompts: PromptDef[] = [login];
