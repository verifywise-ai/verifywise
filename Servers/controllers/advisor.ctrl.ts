import { Request, Response } from "express";
import type { UIMessage } from "ai";
import { streamAdvisorAiSdk, runAdvisorAiSdk, getStreamTextResult } from "../advisor/aiSdkAgent";
import { STATUS_CODE } from "../utils/statusCode.utils";
import logger, { logStructured } from "../utils/logger/fileLogger";
import { getLLMKeysWithKeyQuery, getLLMProviderUrl } from "../utils/llmKey.utils";
import { LLMProvider } from "../domain.layer/interfaces/i.llmKey";
import {
  getConversationQuery,
  upsertConversationQuery,
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
];

export async function runAdvisor(req: Request, res: Response) {
  const functionName = "runAdvisor";
  logStructured(
    "processing",
    "Getting VerifyWise advisor response",
    functionName,
    fileName,
  );
  logger.debug(" Getting VerifyWise advisor response");

  try {
    const prompt = req.body.prompt;
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const llmKeyId = req.query.llmKeyId ? Number(Array.isArray(req.query.llmKeyId) ? req.query.llmKeyId[0] : req.query.llmKeyId) : undefined;

    // Validate required parameters
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    if (!organizationId) {
      return res.status(400).json({ error: "Organization context is required" });
    }

    logger.debug(
      `Running advisor for organization: ${organizationId}, user: ${userId}, llmKeyId: ${llmKeyId}`,
    );

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      logger.debug(`No LLM keys found for organization: ${organizationId}`);
      return res
        .status(400)
        .json({ error: "No LLM keys configured for this organization." });
    }

    const apiKey = selectLLMKey(clients, llmKeyId);
    const url = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);

    const agentParams = {
      apiKey: apiKey.key || "",
      baseURL: url,
      model: apiKey.model,
      userPrompt: prompt,
      tenant: organizationId,
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
    logStructured(
      "error",
      "failed to get VerifyWise advisor response",
      functionName,
      fileName,
    );
    logger.error("❌ Error in getting VerifyWise advisor response:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Get conversation history for a specific domain
 */
export async function getConversation(req: Request, res: Response) {
  const functionName = "getConversation";

  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const domain = Array.isArray(req.params.domain) ? req.params.domain[0] : req.params.domain;

    if (!userId) {
      return res.status(400).json({ error: "User context is required" });
    }

    if (!domain) {
      return res.status(400).json({ error: "Domain is required" });
    }

    logger.debug(`Getting conversation for organization: ${organizationId}, user: ${userId}, domain: ${domain}`);

    const conversation = await getConversationQuery(organizationId, userId, domain);

    if (!conversation) {
      // Return empty messages array if no conversation exists
      return res.status(200).json({
        domain,
        messages: [],
      });
    }

    logStructured(
      "successful",
      `Retrieved conversation for domain: ${domain}`,
      functionName,
      fileName,
    );

    return res.status(200).json({
      domain: conversation.domain,
      messages: conversation.messages,
    });
  } catch (error) {
    logStructured(
      "error",
      "Failed to get conversation",
      functionName,
      fileName,
    );
    logger.error("❌ Error getting conversation:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Save/update conversation messages for a specific domain
 */
export async function saveConversation(req: Request, res: Response) {
  const functionName = "saveConversation";

  try {
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const domain = Array.isArray(req.params.domain) ? req.params.domain[0] : req.params.domain;
    const messages: IAdvisorMessage[] = req.body.messages;

    if (!userId) {
      return res.status(400).json({ error: "User context is required" });
    }

    if (!domain) {
      return res.status(400).json({ error: "Domain is required" });
    }

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    logger.debug(`Saving conversation for organization: ${organizationId}, user: ${userId}, domain: ${domain}, messages: ${messages.length}`);

    const conversation = await upsertConversationQuery(organizationId, userId, domain, messages);

    logStructured(
      "successful",
      `Saved conversation for domain: ${domain} with ${messages.length} messages`,
      functionName,
      fileName,
    );

    return res.status(200).json({
      domain: conversation.domain,
      messages: conversation.messages,
    });
  } catch (error) {
    logStructured(
      "error",
      "Failed to save conversation",
      functionName,
      fileName,
    );
    logger.error("❌ Error saving conversation:", error);
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}

/**
 * Streaming advisor endpoint — returns SSE text/event-stream.
 * Tool-calling iterations happen server-side; the final LLM response streams to the client.
 */
export async function streamAdvisor(req: Request, res: Response) {
  const functionName = "streamAdvisor";
  logStructured(
    "processing",
    "Starting streaming advisor response",
    functionName,
    fileName,
  );

  try {
    const prompt = req.body.prompt;
    const organizationId = req.organizationId!;
    const userId = req.userId ? Number(req.userId) : undefined;
    const llmKeyId = req.query.llmKeyId
      ? Number(Array.isArray(req.query.llmKeyId) ? req.query.llmKeyId[0] : req.query.llmKeyId)
      : undefined;

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ error: "Organization context is required" });
      return;
    }

    logger.debug(
      `Streaming advisor for organization: ${organizationId}, user: ${userId}, llmKeyId: ${llmKeyId}`,
    );

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      res.status(400).json({ error: "No LLM keys configured for this organization." });
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
          logger.debug(`[TIMER] First text chunk written to client at +${firstChunkTime - streamStartTime}ms`);
        }
      }
      sendSSE(chunk);
    }

    const lastChunkTime = Date.now();
    logger.debug(`[TIMER] Streamed ${chunkCount} text chunks to client. First-to-last spread: ${firstChunkTime ? lastChunkTime - firstChunkTime : 0}ms`);

    // Send the final done event with the complete text for chart parsing
    sendSSE({ type: "done", content: fullText });
    res.end();

    logStructured(
      "successful",
      "Streaming advisor response completed",
      functionName,
      fileName,
    );
  } catch (error) {
    logStructured(
      "error",
      "Failed to stream advisor response",
      functionName,
      fileName,
    );
    logger.error("❌ Error in streaming advisor response:", error);

    // If headers haven't been sent yet, send JSON error
    if (!res.headersSent) {
      res.status(500).json(STATUS_CODE[500]((error as Error).message));
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
  logStructured(
    "processing",
    "Starting AI SDK streaming advisor response",
    functionName,
    fileName,
  );

  try {
    const messages: UIMessage[] = req.body.messages || [];
    const llmKeyId = req.body.llmKeyId as number | undefined;
    const organizationId = req.organizationId!;

    // Extract the last user message as the prompt
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const prompt = lastUserMessage?.parts
      ?.filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("\n") || undefined;

    if (!prompt) {
      res.status(400).json({ error: "No user message found" });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ error: "Organization context is required" });
      return;
    }

    logger.debug(
      `AI SDK streaming advisor for organization: ${organizationId}, llmKeyId: ${llmKeyId}`,
    );

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      res.status(400).json({ error: "No LLM keys configured for this organization." });
      return;
    }

    const apiKey = selectLLMKey(clients, llmKeyId);
    const url = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);

    const result = getStreamTextResult({
      apiKey: apiKey.key || "",
      baseURL: url,
      model: apiKey.model,
      userPrompt: prompt,
      tenant: organizationId,
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
    logStructured(
      "error",
      "Failed to stream AI SDK advisor response",
      functionName,
      fileName,
    );
    logger.error("❌ Error in AI SDK streaming advisor response:", error);

    if (!res.headersSent) {
      res.status(500).json(STATUS_CODE[500]((error as Error).message));
    }
  }
}
