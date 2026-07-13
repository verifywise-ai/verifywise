import { Request, Response } from "express";
import type { UIMessage } from "ai";
import { convertToModelMessages } from "ai";
import { streamAdvisorAiSdk, runAdvisorAiSdk, getStreamTextResult } from "../advisor/aiSdkAgent";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { getLLMKeysWithKeyQuery, getLLMProviderUrl } from "../utils/llmKey.utils";
import { LLMProvider } from "../domain.layer/interfaces/i.llmKey";
import {
  listConversationsQuery,
  getConversationByIdQuery,
  createConversationQuery,
  updateConversationMessagesQuery,
  deleteConversationQuery,
} from "../utils/advisorConversation.utils";
import {
  clearAgentMemory,
  clearSession as clearAgentSession,
  clearUserMemory,
  getUserMemorySummary,
  getAgentMessages,
} from "../advisor/memory/memoryService";
import { IAdvisorMessage } from "../domain.layer/interfaces/i.advisorConversation";
import { availableRiskTools } from "../advisor/functions/riskFunctions";
import { availableModelInventoryTools } from "../advisor/functions/modelInventoryFunctions";
import { availableModelRiskTools } from "../advisor/functions/modelRiskFunctions";
import { availableVendorTools } from "../advisor/functions/vendorFunctions";
import { availableIncidentTools } from "../advisor/functions/incidentFunctions";
import { availableTaskTools } from "../advisor/functions/taskFunctions";
import { availablePolicyTools } from "../advisor/functions/policyFunctions";
import { availableUseCaseTools } from "../advisor/functions/useCaseFunctions";
import { availableDatasetTools } from "../advisor/functions/datasetFunctions";
import { availableFrameworkTools } from "../advisor/functions/frameworkFunctions";
import { availableTrainingTools } from "../advisor/functions/trainingFunctions";
import { availableEvidenceTools } from "../advisor/functions/evidenceFunctions";
import { availableReportingTools } from "../advisor/functions/reportingFunctions";
import { availableAiTrustCentreTools } from "../advisor/functions/aiTrustCentreFunctions";
import { availableAgentDiscoveryTools } from "../advisor/functions/agentDiscoveryFunctions";
import { availableEvidenceAiTools } from "../advisor/functions/evidenceAiFunctions";
import { availableReadinessTools } from "../advisor/functions/readinessFunctions";
import { availableChangeHistoryTools } from "../advisor/functions/changeHistoryFunctions";
import { availableNotesTools } from "../advisor/functions/notesFunctions";
import { availableNotificationTools } from "../advisor/functions/notificationFunctions";
import { availableApprovalWorkflowTools } from "../advisor/functions/approvalWorkflowFunctions";
import { availableAutomationTools } from "../advisor/functions/automationFunctions";
import { availablePmmTools } from "../advisor/functions/pmmFunctions";
import { availableFileManagementTools } from "../advisor/functions/fileManagementFunctions";
import { availableVirtualFolderTools } from "../advisor/functions/virtualFolderFunctions";
import { availableShadowAiTools } from "../advisor/functions/shadowAiFunctions";
import { availableAiDetectionTools } from "../advisor/functions/aiDetectionFunctions";
import { availableEntityGraphTools } from "../advisor/functions/entityGraphFunctions";
import { availableEuAiActTools } from "../advisor/functions/euAiActFunctions";
import { availableIso42001Tools } from "../advisor/functions/iso42001Functions";
import { availableIso27001Tools } from "../advisor/functions/iso27001Functions";
import { availableNistAiRmfTools } from "../advisor/functions/nistAiRmfFunctions";
import { availableComplianceTools } from "../advisor/functions/complianceFunctions";
import { availableSearchTools } from "../advisor/functions/searchFunctions";
import { availableShareLinkTools } from "../advisor/functions/shareLinkFunctions";
import { availableCeMarkingTools } from "../advisor/functions/ceMarkingFunctions";
import { availablePolicyLinkedObjectTools } from "../advisor/functions/policyLinkedObjectFunctions";
import { availableAuditLedgerTools } from "../advisor/functions/auditLedgerFunctions";
import { availableAdminTools } from "../advisor/functions/adminFunctions";
import { availableUserTools } from "../advisor/functions/userFunctions";
import { availableProjectTools } from "../advisor/functions/projectFunctions";
import { availableFrameworkLookupTools } from "../advisor/functions/frameworkLookupFunctions";
import { toolsDefinition as riskToolsDefinition } from "../advisor/tools/riskTools";
import { toolsDefinition as modelInventoryToolsDefinition } from "../advisor/tools/modelInventoryTools";
import { toolsDefinition as modelRiskToolsDefinition } from "../advisor/tools/modelRiskTools";
import { toolsDefinition as vendorToolsDefinition } from "../advisor/tools/vendorTools";
import { toolsDefinition as incidentToolsDefinition } from "../advisor/tools/incidentTools";
import { toolsDefinition as taskToolsDefinition } from "../advisor/tools/taskTools";
import { toolsDefinition as policyToolsDefinition } from "../advisor/tools/policyTools";
import { toolsDefinition as useCaseToolsDefinition } from "../advisor/tools/useCaseTools";
import { toolsDefinition as datasetToolsDefinition } from "../advisor/tools/datasetTools";
import { toolsDefinition as frameworkToolsDefinition } from "../advisor/tools/frameworkTools";
import { toolsDefinition as trainingToolsDefinition } from "../advisor/tools/trainingTools";
import { toolsDefinition as evidenceToolsDefinition } from "../advisor/tools/evidenceTools";
import { toolsDefinition as reportingToolsDefinition } from "../advisor/tools/reportingTools";
import { toolsDefinition as aiTrustCentreToolsDefinition } from "../advisor/tools/aiTrustCentreTools";
import { toolsDefinition as agentDiscoveryToolsDefinition } from "../advisor/tools/agentDiscoveryTools";
import { toolsDefinition as evidenceAiToolsDefinition } from "../advisor/tools/evidenceAiTools";
import { toolsDefinition as readinessToolsDefinition } from "../advisor/tools/readinessTools";
import { toolsDefinition as changeHistoryToolsDefinition } from "../advisor/tools/changeHistoryTools";
import { toolsDefinition as notesToolsDefinition } from "../advisor/tools/notesTools";
import { toolsDefinition as notificationToolsDefinition } from "../advisor/tools/notificationTools";
import { toolsDefinition as approvalWorkflowToolsDefinition } from "../advisor/tools/approvalWorkflowTools";
import { toolsDefinition as automationToolsDefinition } from "../advisor/tools/automationTools";
import { toolsDefinition as pmmToolsDefinition } from "../advisor/tools/pmmTools";
import { toolsDefinition as fileManagementToolsDefinition } from "../advisor/tools/fileManagementTools";
import { toolsDefinition as virtualFolderToolsDefinition } from "../advisor/tools/virtualFolderTools";
import { toolsDefinition as shadowAiToolsDefinition } from "../advisor/tools/shadowAiTools";
import { toolsDefinition as aiDetectionToolsDefinition } from "../advisor/tools/aiDetectionTools";
import { toolsDefinition as entityGraphToolsDefinition } from "../advisor/tools/entityGraphTools";
import { toolsDefinition as euAiActToolsDefinition } from "../advisor/tools/euAiActTools";
import { toolsDefinition as iso42001ToolsDefinition } from "../advisor/tools/iso42001Tools";
import { toolsDefinition as iso27001ToolsDefinition } from "../advisor/tools/iso27001Tools";
import { toolsDefinition as nistAiRmfToolsDefinition } from "../advisor/tools/nistAiRmfTools";
import { toolsDefinition as complianceToolsDefinition } from "../advisor/tools/complianceTools";
import { toolsDefinition as searchToolsDefinition } from "../advisor/tools/searchTools";
import { toolsDefinition as shareLinkToolsDefinition } from "../advisor/tools/shareLinkTools";
import { toolsDefinition as ceMarkingToolsDefinition } from "../advisor/tools/ceMarkingTools";
import { toolsDefinition as policyLinkedObjectToolsDefinition } from "../advisor/tools/policyLinkedObjectTools";
import { toolsDefinition as auditLedgerToolsDefinition } from "../advisor/tools/auditLedgerTools";
import { toolsDefinition as adminToolsDefinition } from "../advisor/tools/adminTools";
import { toolsDefinition as userToolsDefinition } from "../advisor/tools/userTools";
import { toolsDefinition as projectToolsDefinition } from "../advisor/tools/projectTools";
import { toolsDefinition as frameworkLookupToolsDefinition } from "../advisor/tools/frameworkLookupTools";
import { translateError } from "../utils/i18n.utils";
import { aiActionToolDefinitions, aiActionFilers } from "../advisor/aiActions";

const fileName = "advisor.ctrl.ts";

/**
 * Select an LLM key by ID, falling back to the first available key.
 */
function selectLLMKey(clients: any[], llmKeyId?: number): any {
  if (llmKeyId !== undefined) {
    const found = clients.find((k: any) => k.id === llmKeyId);
    if (found) {
      logger.debug(`Using selected LLM key: ${found.name} (ID: ${llmKeyId})`);
      return found;
    }
    logger.warn(`LLM key ID ${llmKeyId} not found, using default key`);
  }
  return clients[0];
}

// Read-only tools are composed per-domain in `advisor/functions/*.ts`.
// AI write tools (agent_create_*, agent_update_*, etc.) are composed via
// the AI Actions registry — adding one only requires creating a new
// `advisor/aiActions/<action>/` module and registering it there.
const availableTools = {
  ...availableRiskTools,
  ...availableModelInventoryTools,
  ...availableModelRiskTools,
  ...availableVendorTools,
  ...availableIncidentTools,
  ...availableTaskTools,
  ...availablePolicyTools,
  ...availableUseCaseTools,
  ...availableDatasetTools,
  ...availableFrameworkTools,
  ...availableTrainingTools,
  ...availableEvidenceTools,
  ...availableReportingTools,
  ...availableAiTrustCentreTools,
  ...availableAgentDiscoveryTools,
  ...availableEvidenceAiTools,
  ...availableReadinessTools,
  ...availableChangeHistoryTools,
  ...availableNotesTools,
  ...availableNotificationTools,
  ...availableApprovalWorkflowTools,
  ...availableAutomationTools,
  ...availablePmmTools,
  ...availableFileManagementTools,
  ...availableVirtualFolderTools,
  ...availableShadowAiTools,
  ...availableAiDetectionTools,
  ...availableEntityGraphTools,
  ...availableEuAiActTools,
  ...availableIso42001Tools,
  ...availableIso27001Tools,
  ...availableNistAiRmfTools,
  ...availableComplianceTools,
  ...availableSearchTools,
  ...availableShareLinkTools,
  ...availableCeMarkingTools,
  ...availablePolicyLinkedObjectTools,
  ...availableAuditLedgerTools,
  ...availableAdminTools,
  ...availableUserTools,
  ...availableProjectTools,
  ...availableFrameworkLookupTools,
  ...aiActionFilers,
};

const toolsDefinition = [
  ...riskToolsDefinition,
  ...modelInventoryToolsDefinition,
  ...modelRiskToolsDefinition,
  ...vendorToolsDefinition,
  ...incidentToolsDefinition,
  ...taskToolsDefinition,
  ...policyToolsDefinition,
  ...useCaseToolsDefinition,
  ...datasetToolsDefinition,
  ...frameworkToolsDefinition,
  ...trainingToolsDefinition,
  ...evidenceToolsDefinition,
  ...reportingToolsDefinition,
  ...aiTrustCentreToolsDefinition,
  ...agentDiscoveryToolsDefinition,
  ...evidenceAiToolsDefinition,
  ...readinessToolsDefinition,
  ...changeHistoryToolsDefinition,
  ...notesToolsDefinition,
  ...notificationToolsDefinition,
  ...approvalWorkflowToolsDefinition,
  ...automationToolsDefinition,
  ...pmmToolsDefinition,
  ...fileManagementToolsDefinition,
  ...virtualFolderToolsDefinition,
  ...shadowAiToolsDefinition,
  ...aiDetectionToolsDefinition,
  ...entityGraphToolsDefinition,
  ...euAiActToolsDefinition,
  ...iso42001ToolsDefinition,
  ...iso27001ToolsDefinition,
  ...nistAiRmfToolsDefinition,
  ...complianceToolsDefinition,
  ...searchToolsDefinition,
  ...shareLinkToolsDefinition,
  ...ceMarkingToolsDefinition,
  ...policyLinkedObjectToolsDefinition,
  ...auditLedgerToolsDefinition,
  ...adminToolsDefinition,
  ...userToolsDefinition,
  ...projectToolsDefinition,
  ...frameworkLookupToolsDefinition,
  ...aiActionToolDefinitions,
];

export async function runAdvisor(req: Request, res: Response) {
  const functionName = "runAdvisor";
  logStructured("processing", "Getting VerifyWise advisor response", functionName, fileName);
  logger.debug(" Getting VerifyWise advisor response");

  try {
    const prompt = req.body.prompt;
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const llmKeyId = req.query.llmKeyId
      ? Number(Array.isArray(req.query.llmKeyId) ? req.query.llmKeyId[0] : req.query.llmKeyId)
      : undefined;

    // Validate required parameters
    if (!prompt) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Prompt is required")));
    }

    if (!organizationId) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Organization context is required")));
    }

    logger.debug(
      `Running advisor for organization: ${organizationId}, user: ${userId}, llmKeyId: ${llmKeyId}`,
    );

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      logger.debug(`No LLM keys found for organization: ${organizationId}`);
      return res
        .status(400)
        .json(STATUS_CODE[400]("No LLM keys configured for this organization."));
    }

    const apiKey = selectLLMKey(clients, llmKeyId);
    const url = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);

    // sessionId for agent memory: same plumbing as the streaming endpoints.
    const memorySessionId =
      typeof req.body?.sessionId === "string" && req.body.sessionId.trim().length > 0
        ? req.body.sessionId
        : userId
          ? `user-${userId}-${new Date().toISOString().slice(0, 10)}`
          : undefined;

    const agentParams = {
      apiKey: apiKey.key || "",
      baseURL: url,
      model: apiKey.model,
      userPrompt: prompt,
      tenant: organizationId,
      userId,
      availableTools,
      toolsDefinition,
      provider: apiKey.name as "Anthropic" | "OpenAI" | "OpenRouter" | "Custom",
      headers: apiKey.custom_headers || undefined,
      sessionId: memorySessionId,
      agentName: "advisor" as const,
    };

    const response = await runAdvisorAiSdk(agentParams);

    logStructured(
      "successful",
      "Getting VerifyWise advisor response successful",
      functionName,
      fileName,
    );

    // Note: chart data is delivered via generate_chart tool results in the stream,
    // not embedded in the text. The non-streaming endpoint only returns markdown.
    return res.status(200).json({ prompt, response: { markdown: response, chartData: null } });
  } catch (error) {
    logStructured("error", "failed to get VerifyWise advisor response", functionName, fileName);
    logger.error("❌ Error in getting VerifyWise advisor response:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Normalize the `:domain` path param (which may arrive as `string` or
 * `string[]` depending on how Express was started) into a plain string.
 * Returns null if absent — callers should 400.
 */
function getDomainParam(req: Request): string | null {
  const raw = req.params.domain;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && typeof value === "string" ? value : null;
}

/**
 * Parse the `:id` path param into a positive integer. Returns null on any
 * parse failure so the caller can emit a clean 400.
 */
function getIdParam(req: Request): number | null {
  const raw = req.params.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

/**
 * List all conversations the requesting user has in a given advisor
 * domain, most recent first. Returns summaries (no full messages) so the
 * response stays small even for long histories.
 */
export async function listConversations(req: Request, res: Response) {
  const functionName = "listConversations";

  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const domain = getDomainParam(req);

    if (!userId) {
      return res.status(400).json(STATUS_CODE[400](req.t!("User context is required")));
    }

    if (!domain) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Domain is required")));
    }

    logger.debug(
      `Listing conversations for organization: ${organizationId}, user: ${userId}, domain: ${domain}`,
    );

    const conversations = await listConversationsQuery(organizationId, userId, domain);

    logStructured(
      "successful",
      `Listed ${conversations.length} conversations for domain: ${domain}`,
      functionName,
      fileName,
    );

    return res.status(200).json({ domain, conversations });
  } catch (error) {
    logStructured("error", "Failed to list conversations", functionName, fileName);
    logger.error("❌ Error listing conversations:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Fetch a single conversation (including its full messages array) by id.
 * Scoped to the requesting org + user — returns 404 if the row doesn't
 * exist under that scope, even if it exists in another tenant.
 */
export async function getConversationById(req: Request, res: Response) {
  const functionName = "getConversationById";

  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const domain = getDomainParam(req);
    const id = getIdParam(req);

    if (!userId) {
      return res.status(400).json(STATUS_CODE[400](req.t!("User context is required")));
    }

    if (!domain) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Domain is required")));
    }

    if (id === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Valid conversation id is required")));
    }

    logger.debug(
      `Getting conversation id=${id} for organization: ${organizationId}, user: ${userId}, domain: ${domain}`,
    );

    const conversation = await getConversationByIdQuery(organizationId, userId, id);

    if (!conversation) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Conversation not found")));
    }

    // The row is fetched by id + user + org, but we still verify the domain
    // matches what the client asked for. This catches frontend bugs early
    // (wrong domain in the URL) and keeps responses predictable.
    if (conversation.domain !== domain) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Conversation not found")));
    }

    logStructured(
      "successful",
      `Retrieved conversation id=${id} for domain: ${domain}`,
      functionName,
      fileName,
    );

    return res.status(200).json({
      domain: conversation.domain,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages,
        last_message_at: conversation.last_message_at,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      },
    });
  } catch (error) {
    logStructured("error", "Failed to get conversation by id", functionName, fileName);
    logger.error("❌ Error getting conversation by id:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Create a new empty conversation in the given domain. Title is null until
 * the first user message lands via the update endpoint.
 */
export async function createConversation(req: Request, res: Response) {
  const functionName = "createConversation";

  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const domain = getDomainParam(req);

    if (!userId) {
      return res.status(400).json(STATUS_CODE[400](req.t!("User context is required")));
    }

    if (!domain) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Domain is required")));
    }

    logger.debug(
      `Creating conversation for organization: ${organizationId}, user: ${userId}, domain: ${domain}`,
    );

    const conversation = await createConversationQuery(organizationId, userId, domain);

    logStructured(
      "successful",
      `Created conversation id=${conversation.id} for domain: ${domain}`,
      functionName,
      fileName,
    );

    return res.status(201).json({
      domain: conversation.domain,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages,
        last_message_at: conversation.last_message_at,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      },
    });
  } catch (error) {
    logStructured("error", "Failed to create conversation", functionName, fileName);
    logger.error("❌ Error creating conversation:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Replace the messages of an existing conversation. Called by the
 * frontend after every turn (both user submission and assistant finish).
 * Bumps last_message_at and auto-derives the title on first save.
 */
export async function updateConversation(req: Request, res: Response) {
  const functionName = "updateConversation";

  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const domain = getDomainParam(req);
    const id = getIdParam(req);
    const messages: IAdvisorMessage[] = req.body.messages;

    if (!userId) {
      return res.status(400).json(STATUS_CODE[400](req.t!("User context is required")));
    }

    if (!domain) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Domain is required")));
    }

    if (id === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Valid conversation id is required")));
    }

    if (!Array.isArray(messages)) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Messages array is required")));
    }

    logger.debug(
      `Updating conversation id=${id} for organization: ${organizationId}, user: ${userId}, domain: ${domain}, messages: ${messages.length}`,
    );

    // Double-check domain ownership before writing. The UPDATE is scoped to
    // (org, user, id) which is safe, but a client could attempt to overwrite
    // a conversation from a different domain. Reject that explicitly.
    const existing = await getConversationByIdQuery(organizationId, userId, id);
    if (!existing) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Conversation not found")));
    }
    if (existing.domain !== domain) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Conversation not found")));
    }

    const conversation = await updateConversationMessagesQuery(
      organizationId,
      userId,
      id,
      messages,
    );

    if (!conversation) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Conversation not found")));
    }

    logStructured(
      "successful",
      `Updated conversation id=${id} for domain: ${domain} with ${messages.length} messages`,
      functionName,
      fileName,
    );

    return res.status(200).json({
      domain: conversation.domain,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages,
        last_message_at: conversation.last_message_at,
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      },
    });
  } catch (error) {
    logStructured("error", "Failed to update conversation", functionName, fileName);
    logger.error("❌ Error updating conversation:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Delete a conversation by id. Scoped to the caller's org + user.
 */
export async function deleteConversation(req: Request, res: Response) {
  const functionName = "deleteConversation";

  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const domain = getDomainParam(req);
    const id = getIdParam(req);

    if (!userId) {
      return res.status(400).json(STATUS_CODE[400](req.t!("User context is required")));
    }

    if (!domain) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Domain is required")));
    }

    if (id === null) {
      return res.status(400).json(STATUS_CODE[400](req.t!("Valid conversation id is required")));
    }

    // Confirm the row exists in this domain before deleting so we never
    // delete a conversation from a different domain via a crafted URL.
    const existing = await getConversationByIdQuery(organizationId, userId, id);
    if (!existing || existing.domain !== domain) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Conversation not found")));
    }

    const deleted = await deleteConversationQuery(organizationId, userId, id);

    if (!deleted) {
      return res.status(404).json(STATUS_CODE[404](req.t!("Conversation not found")));
    }

    logStructured(
      "successful",
      `Deleted conversation id=${id} for domain: ${domain}`,
      functionName,
      fileName,
    );

    return res.status(204).send();
  } catch (error) {
    logStructured("error", "Failed to delete conversation", functionName, fileName);
    logger.error("❌ Error deleting conversation:", error);
    return res.status(500).json(STATUS_CODE[500](translateError(req, error)));
  }
}

/**
 * Streaming advisor endpoint — returns SSE text/event-stream.
 * Tool-calling iterations happen server-side; the final LLM response streams to the client.
 */
export async function streamAdvisor(req: Request, res: Response) {
  const functionName = "streamAdvisor";
  logStructured("processing", "Starting streaming advisor response", functionName, fileName);

  try {
    const prompt = req.body.prompt;
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const llmKeyId = req.query.llmKeyId
      ? Number(Array.isArray(req.query.llmKeyId) ? req.query.llmKeyId[0] : req.query.llmKeyId)
      : undefined;

    if (!prompt) {
      res.status(400).json(STATUS_CODE[400](req.t!("Prompt is required")));
      return;
    }

    if (!organizationId) {
      res.status(400).json(STATUS_CODE[400](req.t!("Organization context is required")));
      return;
    }

    logger.debug(
      `Streaming advisor for organization: ${organizationId}, user: ${userId}, llmKeyId: ${llmKeyId}`,
    );

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      res
        .status(400)
        .json(STATUS_CODE[400](req.t!("No LLM keys configured for this organization.")));
      return;
    }

    const apiKey = selectLLMKey(clients, llmKeyId);
    const url = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);

    // Set SSE headers — disable ALL buffering for real-time streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Content-Encoding", "none");
    res.flushHeaders();

    // Helper: write SSE event and flush immediately
    const sendSSE = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // Flush if available (when compression middleware is active)
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    };

    // sessionId for agent memory: prefer explicit body field, fall back to a
    // synthetic per-user / per-day grouping so memory still accumulates for
    // legacy callers. Memory writes are skipped entirely when userId or
    // sessionId are missing — see memoryEnabled() in aiSdkAgent.ts.
    const memorySessionId =
      typeof req.body?.sessionId === "string" && req.body.sessionId.trim().length > 0
        ? req.body.sessionId
        : userId
          ? `user-${userId}-${new Date().toISOString().slice(0, 10)}`
          : undefined;

    const agentParams = {
      apiKey: apiKey.key || "",
      baseURL: url,
      model: apiKey.model,
      userPrompt: prompt,
      tenant: organizationId,
      userId,
      availableTools,
      toolsDefinition,
      provider: apiKey.name as "Anthropic" | "OpenAI" | "OpenRouter" | "Custom",
      headers: apiKey.custom_headers || undefined,
      sessionId: memorySessionId,
      agentName: "advisor" as const,
    };

    // Send an immediate status event so the client knows the connection is open
    sendSSE({ type: "status", content: "thinking" });

    const generator = streamAdvisorAiSdk(agentParams);

    let fullText = "";
    let chunkCount = 0;
    let firstChunkTime = 0;
    const streamStartTime = Date.now();

    for await (const chunk of generator) {
      if (chunk.type === "text") {
        fullText += chunk.content;
        chunkCount++;
        if (chunkCount === 1) {
          firstChunkTime = Date.now();
          logger.debug(
            `[TIMER] First text chunk written to client at +${firstChunkTime - streamStartTime}ms`,
          );
        }
      }
      sendSSE(chunk);
    }

    const lastChunkTime = Date.now();
    logger.debug(
      `[TIMER] Streamed ${chunkCount} text chunks to client. First-to-last spread: ${firstChunkTime ? lastChunkTime - firstChunkTime : 0}ms`,
    );

    // Send the final done event with the complete text for chart parsing
    sendSSE({ type: "done", content: fullText });
    res.end();

    logStructured("successful", "Streaming advisor response completed", functionName, fileName);
  } catch (error) {
    logStructured("error", "Failed to stream advisor response", functionName, fileName);
    logger.error("❌ Error in streaming advisor response:", error);

    // If headers haven't been sent yet, send JSON error
    if (!res.headersSent) {
      res.status(500).json(STATUS_CODE[500](translateError(req, error)));
      return;
    }

    // If SSE already started, send error event and close
    res.write(`data: ${JSON.stringify({ type: "error", content: (error as Error).message })}\n\n`);
    res.end();
  }
}

/**
 * AI SDK v2 streaming endpoint — outputs the native AI SDK UI message stream protocol.
 * Consumed by the frontend's useChat hook from @ai-sdk/react.
 *
 * Expects body: { messages: UIMessage[], llmKeyId?: number }
 * The last user message is extracted as the prompt.
 */
export async function streamAdvisorV2(req: Request, res: Response) {
  const functionName = "streamAdvisorV2";
  logStructured("processing", "Starting AI SDK streaming advisor response", functionName, fileName);

  try {
    const messages: UIMessage[] = req.body.messages || [];
    const llmKeyId = req.body.llmKeyId as number | undefined;
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;

    // Guard: must end on a user turn so the model has something to respond to.
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      res.status(400).json(STATUS_CODE[400](req.t!("Last message must be from the user")));
      return;
    }

    // Convert the UI message protocol into the plain ModelMessage shape the
    // AI SDK's streamText expects. Handles text parts, tool parts, and
    // attachments uniformly — we just pass everything through so the LLM
    // sees the complete conversation history.
    const modelMessages = await convertToModelMessages(messages);

    if (modelMessages.length === 0) {
      res.status(400).json(STATUS_CODE[400](req.t!("No renderable messages found")));
      return;
    }

    if (!organizationId) {
      res.status(400).json(STATUS_CODE[400](req.t!("Organization context is required")));
      return;
    }

    logger.debug(
      `AI SDK streaming advisor for organization: ${organizationId}, llmKeyId: ${llmKeyId}`,
    );

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      res
        .status(400)
        .json(STATUS_CODE[400](req.t!("No LLM keys configured for this organization.")));
      return;
    }

    const apiKey = selectLLMKey(clients, llmKeyId);
    const url = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);

    // sessionId for agent memory: chat endpoint may carry an explicit
    // `conversationId` from the client (which the frontend uses to group
    // chat persistence). Use that when present; otherwise synthesize a
    // per-user / per-day grouping for legacy callers.
    const memorySessionId =
      typeof (req.body as any)?.conversationId === "string" &&
      (req.body as any).conversationId.trim().length > 0
        ? (req.body as any).conversationId
        : typeof (req.body as any)?.sessionId === "string" &&
            (req.body as any).sessionId.trim().length > 0
          ? (req.body as any).sessionId
          : userId
            ? `user-${userId}-${new Date().toISOString().slice(0, 10)}`
            : undefined;

    const result = await getStreamTextResult({
      apiKey: apiKey.key || "",
      baseURL: url,
      model: apiKey.model,
      // `messages` carries the full multi-turn history; `userPrompt` is kept
      // as an empty string because it's ignored when `messages` is set but
      // the type still requires it.
      userPrompt: "",
      messages: modelMessages,
      tenant: organizationId,
      userId,
      availableTools,
      toolsDefinition,
      provider: apiKey.name as "Anthropic" | "OpenAI" | "OpenRouter" | "Custom",
      headers: apiKey.custom_headers || undefined,
      sessionId: memorySessionId,
      agentName: "advisor" as const,
    });

    // Pipe the stream. Critical: supply `onError` to convert errors into
    // user-visible text. Without it, the AI SDK silently closes the stream
    // on failures (invalid API key, provider 4xx/5xx, network drops) and
    // the user sees a blank response. `onError` returns the string that
    // gets appended to the stream as the assistant's final text.
    result.pipeUIMessageStreamToResponse(res, {
      sendReasoning: true,
      sendSources: true,
      onError: (error: unknown) => {
        logger.error("❌ AI SDK stream error:", error);
        logStructured("error", "AI SDK stream error", functionName, fileName);

        // Extract the provider's HTTP status if present — Anthropic/OpenAI
        // errors from @ai-sdk/* providers expose `statusCode` on the error.
        const statusCode = (error as { statusCode?: number })?.statusCode;
        const message = error instanceof Error ? error.message : String(error);

        // Friendly mapping for the common failure modes so the user has
        // an actionable hint, not just a stack-trace substring.
        if (statusCode === 401 || /invalid.*api.*key|unauthorized/i.test(message)) {
          return "I couldn't reach the AI provider — the configured API key was rejected. Ask an Admin to verify the LLM key in Settings.";
        }
        if (statusCode === 429 || /rate.*limit/i.test(message)) {
          return "The AI provider is rate-limiting this request. Please wait a moment and try again.";
        }
        if (statusCode === 400 || /bad.*request/i.test(message)) {
          return `The AI provider rejected the request: ${message}`;
        }
        if (statusCode && statusCode >= 500) {
          return "The AI provider is currently unavailable. Please try again shortly.";
        }

        return `Something went wrong while generating a response: ${message}`;
      },
    });

    logStructured(
      "processing",
      "AI SDK streaming advisor response initiated",
      functionName,
      fileName,
    );
  } catch (error) {
    logStructured("error", "Failed to stream AI SDK advisor response", functionName, fileName);
    logger.error("❌ Error in AI SDK streaming advisor response:", error);

    if (!res.headersSent) {
      res.status(500).json(STATUS_CODE[500](translateError(req, error)));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Agent memory — inspection + GDPR right-to-erasure                  */
/* ------------------------------------------------------------------ */

/**
 * GET /api/advisor/memory
 *
 * Returns a privacy-friendly summary of what the agent memory subsystem has
 * stored for the calling user. No raw message content — just counts, agent
 * names, oldest/newest timestamps, and recent session ids. The full content
 * is available to admins via the Admin API on memoryService.
 */
export async function getMemorySummary(req: Request, res: Response) {
  const functionName = "getMemorySummary";
  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : null;
    if (!organizationId || !userId) {
      return res.status(400).json(STATUS_CODE[400]("Auth context required"));
    }
    const summary = await getUserMemorySummary(organizationId, userId);
    logStructured(
      "successful",
      `memory summary served (${summary.total_messages} messages)`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200](summary));
  } catch (error) {
    logStructured("error", "memory summary failed", functionName, fileName);
    logger.error("Error in getMemorySummary:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * DELETE /api/advisor/memory
 *
 * GDPR right-to-erasure. Clears agent_message_history rows for the calling
 * user. Optional query params:
 *   - agentName: limit purge to one agent (e.g., "advisor")
 *   - sessionId: limit purge to one session
 *
 * Returns the number of rows removed for audit.
 */
export async function deleteMyMemory(req: Request, res: Response) {
  const functionName = "deleteMyMemory";
  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : null;
    if (!organizationId || !userId) {
      return res.status(400).json(STATUS_CODE[400]("Auth context required"));
    }

    const rawAgent = req.query.agentName;
    const agentName =
      typeof rawAgent === "string" && rawAgent.trim().length > 0 ? rawAgent.trim() : undefined;
    const rawSession = req.query.sessionId;
    const sessionId =
      typeof rawSession === "string" && rawSession.trim().length > 0
        ? rawSession.trim()
        : undefined;

    let removed = 0;
    if (sessionId) {
      // Per-session clear is finer-grained: drop just one conversation.
      await clearAgentSession(organizationId, agentName ?? "advisor", sessionId);
      // clearSession doesn't return a count in the existing helper, so we
      // surface a sentinel value. The caller can re-fetch the summary.
      removed = -1;
    } else {
      removed = await clearUserMemory(organizationId, userId, agentName);
    }

    logStructured(
      "successful",
      `memory purged (rows=${removed}, agent=${agentName ?? "*"}, session=${sessionId ?? "*"}) for user ${userId}`,
      functionName,
      fileName,
    );
    return res.status(200).json(
      STATUS_CODE[200]({
        removed_rows: removed,
        agent_name: agentName ?? null,
        session_id: sessionId ?? null,
      }),
    );
  } catch (error) {
    logStructured("error", "memory delete failed", functionName, fileName);
    logger.error("Error in deleteMyMemory:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * DELETE /api/advisor/memory/admin/agent/:agentName
 *
 * Admin-only — clear ALL memory rows (message history, working memory,
 * semantic memory) for a specific agent across the whole organization.
 * RBAC is enforced by `requireRole(["Admin"])` at the route level.
 */
export async function adminClearAgentMemory(req: Request, res: Response) {
  const functionName = "adminClearAgentMemory";
  try {
    const organizationId = req.organizationId!;
    const rawAgentName = req.params.agentName;
    const agentName =
      typeof rawAgentName === "string"
        ? rawAgentName
        : Array.isArray(rawAgentName)
          ? rawAgentName[0]
          : "";
    if (!organizationId) {
      return res.status(400).json(STATUS_CODE[400]("Auth context required"));
    }
    if (req.role !== "Admin" && !req.isSuperAdmin) {
      return res.status(403).json(STATUS_CODE[403]("Admin role required to clear agent memory"));
    }
    if (!agentName || agentName.trim().length === 0) {
      return res.status(400).json(STATUS_CODE[400]("agentName is required"));
    }
    await clearAgentMemory(organizationId, agentName);
    logStructured(
      "successful",
      `admin cleared memory for agent ${agentName}`,
      functionName,
      fileName,
    );
    return res.status(200).json(STATUS_CODE[200]({ cleared: true, agent_name: agentName }));
  } catch (error) {
    logStructured("error", "admin clear failed", functionName, fileName);
    logger.error("Error in adminClearAgentMemory:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * GET /api/advisor/memory/admin/agent/:agentName
 *
 * Admin-only — fetch the most recent N messages for an agent across the
 * organization. Used by the Settings UI to show what's stored. RBAC is
 * enforced by `requireRole(["Admin"])` at the route level.
 */
export async function adminListAgentMessages(req: Request, res: Response) {
  const functionName = "adminListAgentMessages";
  try {
    const organizationId = req.organizationId!;
    const rawAgentName = req.params.agentName;
    const agentName =
      typeof rawAgentName === "string"
        ? rawAgentName
        : Array.isArray(rawAgentName)
          ? rawAgentName[0]
          : "";
    const limit =
      typeof req.query.limit === "string"
        ? Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50))
        : 50;
    if (!organizationId) {
      return res.status(400).json(STATUS_CODE[400]("Auth context required"));
    }
    if (req.role !== "Admin" && !req.isSuperAdmin) {
      return res.status(403).json(STATUS_CODE[403]("Admin role required"));
    }
    if (!agentName || agentName.trim().length === 0) {
      return res.status(400).json(STATUS_CODE[400]("agentName is required"));
    }
    const rows = await getAgentMessages(organizationId, agentName, limit);
    return res.status(200).json(STATUS_CODE[200](rows));
  } catch (error) {
    logStructured("error", "admin list failed", functionName, fileName);
    logger.error("Error in adminListAgentMessages:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
