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
      return res.status(400).json({ error: req.t!("Prompt is required") });
    }

    if (!organizationId) {
      return res.status(400).json({ error: req.t!("Organization context is required") });
    }

    logger.debug(
      `Running advisor for organization: ${organizationId}, user: ${userId}, llmKeyId: ${llmKeyId}`,
    );

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      logger.debug(`No LLM keys found for organization: ${organizationId}`);
      return res.status(400).json({ error: "No LLM keys configured for this organization." });
    }

    const apiKey = selectLLMKey(clients, llmKeyId);
    const url = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);

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
      return res.status(400).json({ error: req.t!("User context is required") });
    }

    if (!domain) {
      return res.status(400).json({ error: req.t!("Domain is required") });
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
      return res.status(400).json({ error: req.t!("User context is required") });
    }

    if (!domain) {
      return res.status(400).json({ error: req.t!("Domain is required") });
    }

    if (id === null) {
      return res.status(400).json({ error: req.t!("Valid conversation id is required") });
    }

    logger.debug(
      `Getting conversation id=${id} for organization: ${organizationId}, user: ${userId}, domain: ${domain}`,
    );

    const conversation = await getConversationByIdQuery(organizationId, userId, id);

    if (!conversation) {
      return res.status(404).json({ error: req.t!("Conversation not found") });
    }

    // The row is fetched by id + user + org, but we still verify the domain
    // matches what the client asked for. This catches frontend bugs early
    // (wrong domain in the URL) and keeps responses predictable.
    if (conversation.domain !== domain) {
      return res.status(404).json({ error: req.t!("Conversation not found") });
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
      return res.status(400).json({ error: req.t!("User context is required") });
    }

    if (!domain) {
      return res.status(400).json({ error: req.t!("Domain is required") });
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
      return res.status(400).json({ error: req.t!("User context is required") });
    }

    if (!domain) {
      return res.status(400).json({ error: req.t!("Domain is required") });
    }

    if (id === null) {
      return res.status(400).json({ error: req.t!("Valid conversation id is required") });
    }

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: req.t!("Messages array is required") });
    }

    logger.debug(
      `Updating conversation id=${id} for organization: ${organizationId}, user: ${userId}, domain: ${domain}, messages: ${messages.length}`,
    );

    // Double-check domain ownership before writing. The UPDATE is scoped to
    // (org, user, id) which is safe, but a client could attempt to overwrite
    // a conversation from a different domain. Reject that explicitly.
    const existing = await getConversationByIdQuery(organizationId, userId, id);
    if (!existing) {
      return res.status(404).json({ error: req.t!("Conversation not found") });
    }
    if (existing.domain !== domain) {
      return res.status(404).json({ error: req.t!("Conversation not found") });
    }

    const conversation = await updateConversationMessagesQuery(
      organizationId,
      userId,
      id,
      messages,
    );

    if (!conversation) {
      return res.status(404).json({ error: req.t!("Conversation not found") });
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
      return res.status(400).json({ error: req.t!("User context is required") });
    }

    if (!domain) {
      return res.status(400).json({ error: req.t!("Domain is required") });
    }

    if (id === null) {
      return res.status(400).json({ error: req.t!("Valid conversation id is required") });
    }

    // Confirm the row exists in this domain before deleting so we never
    // delete a conversation from a different domain via a crafted URL.
    const existing = await getConversationByIdQuery(organizationId, userId, id);
    if (!existing || existing.domain !== domain) {
      return res.status(404).json({ error: req.t!("Conversation not found") });
    }

    const deleted = await deleteConversationQuery(organizationId, userId, id);

    if (!deleted) {
      return res.status(404).json({ error: req.t!("Conversation not found") });
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
      res.status(400).json({ error: req.t!("Prompt is required") });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ error: req.t!("Organization context is required") });
      return;
    }

    logger.debug(
      `Streaming advisor for organization: ${organizationId}, user: ${userId}, llmKeyId: ${llmKeyId}`,
    );

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      res.status(400).json({ error: req.t!("No LLM keys configured for this organization.") });
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
      res.status(400).json({ error: req.t!("Last message must be from the user") });
      return;
    }

    // Convert the UI message protocol into the plain ModelMessage shape the
    // AI SDK's streamText expects. Handles text parts, tool parts, and
    // attachments uniformly — we just pass everything through so the LLM
    // sees the complete conversation history.
    const modelMessages = await convertToModelMessages(messages);

    if (modelMessages.length === 0) {
      res.status(400).json({ error: req.t!("No renderable messages found") });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ error: req.t!("Organization context is required") });
      return;
    }

    logger.debug(
      `AI SDK streaming advisor for organization: ${organizationId}, llmKeyId: ${llmKeyId}`,
    );

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      res.status(400).json({ error: req.t!("No LLM keys configured for this organization.") });
      return;
    }

    const apiKey = selectLLMKey(clients, llmKeyId);
    const url = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);

    const result = getStreamTextResult({
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
    });

    // Use the streamText result's built-in method to pipe the AI SDK protocol.
    // pipeUIMessageStreamToResponse is fire-and-forget (returns void);
    // the AI SDK handles stream errors and response completion internally.
    result.pipeUIMessageStreamToResponse(res, {
      sendReasoning: true,
      sendSources: true,
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
