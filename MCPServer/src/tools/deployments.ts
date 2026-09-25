/**
 * Deployment credential tools.
 *
 * Saving a deployment is what makes every other tool usable, so the token is
 * verified against the API before it is written — a stored credential that
 * cannot actually call the super-admin routes would only fail later, somewhere
 * less obvious.
 */

import { z } from "zod";
import { request } from "../client.js";
import {
  configPath,
  deploymentLabel,
  deriveProfileName,
  saveProfile,
  type Profile,
} from "../config.js";
import { result, type ToolDef } from "../tool.js";

const addDeployment: ToolDef = {
  name: "add_deployment",
  title: "Add deployment",
  description:
    "Save a VerifyWise deployment and its API token so the other tools can use it. The token is checked against the deployment before being stored, and is written to the local profile file — it is never sent anywhere else. Existing deployments are kept.",
  inputSchema: {
    name: z
      .string()
      .optional()
      .describe(
        'Short name for this deployment, used as the "profile" argument on every other tool. Derived from the URL host when omitted, which is almost always what you want.',
      ),
    url: z
      .string()
      .url()
      .describe("Base URL of the deployment, for example https://acme.verifywise.ai."),
    token: z
      .string()
      .min(1)
      .describe(
        "API token from that deployment's Settings → API keys. Its user must be an Admin or a super admin.",
      ),
  },
  handler: async (args) => {
    const url = args.url.trim().replace(/\/+$/, "");
    const candidate: Profile = {
      name: args.name?.trim() || deriveProfileName(url),
      url,
      token: args.token.trim(),
    };

    // Proves the credential can do what this server exists to do. Any failure
    // here is reported by client.ts with the reason, and nothing is saved.
    const { data } = await request<unknown[]>(candidate, "GET", "/api/super-admin/organizations");

    saveProfile(candidate);

    return result({
      saved: candidate.name,
      deployment: deploymentLabel(candidate),
      organizationsVisible: Array.isArray(data) ? data.length : 0,
      profileFile: configPath(),
      next: `Pass profile: "${candidate.name}" to the other tools.`,
    });
  },
};

export const deploymentTools: ToolDef[] = [addDeployment];
