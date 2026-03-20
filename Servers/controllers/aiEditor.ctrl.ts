import { Request, Response } from "express";
import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import logger from "../utils/logger/fileLogger";
import { getLLMKeysWithKeyQuery, getLLMProviderUrl } from "../utils/llmKey.utils";
import { LLMProvider } from "../domain.layer/interfaces/i.llmKey";

const SYSTEM_PROMPT = `You are an AI writing assistant embedded in a policy document editor for an AI governance platform called VerifyWise. Your role is to help users write, edit, and improve policy documents related to AI governance, compliance, and risk management.

When generating or editing content:
- Use clear, professional language appropriate for regulatory and compliance documents
- Structure content with proper headings, bullet points, and paragraphs
- Reference relevant frameworks when appropriate (EU AI Act, ISO 42001, NIST AI RMF)
- Keep content concise and actionable
- Respond in plain text (no Markdown formatting like ** or #)

When editing existing text, return only the improved version without explanations unless asked.`;

function selectLLMKey(clients: any[], llmKeyId?: number): any {
  if (llmKeyId !== undefined) {
    const found = clients.find((k: any) => k.id === llmKeyId);
    if (found) return found;
  }
  return clients[0];
}

function createModel(provider: string, apiKey: string, baseURL: string, model: string) {
  if (provider === "Anthropic") {
    const anthropic = createAnthropic({ apiKey, baseURL: baseURL || undefined });
    return anthropic(model);
  }
  const openai = createOpenAI({ apiKey, baseURL });
  return openai(model);
}

/**
 * AI editor endpoint for the policy editor.
 * Accepts { prompt } from useCompletion and streams a text response.
 */
export async function editorAICommand(req: Request, res: Response): Promise<void> {
  try {
    const { prompt } = req.body;
    const llmKeyId = req.body.llmKeyId as number | undefined;
    const organizationId = req.organizationId;

    if (!prompt) {
      res.status(400).json({ error: "Prompt is required" });
      return;
    }

    if (!organizationId) {
      res.status(400).json({ error: "Organization context is required" });
      return;
    }

    const clients = await getLLMKeysWithKeyQuery(organizationId);

    if (clients.length === 0) {
      res.status(400).json({ error: "No LLM keys configured. Ask your admin to add one in Settings > LLM keys." });
      return;
    }

    const apiKey = selectLLMKey(clients, llmKeyId);
    const url = apiKey.url || getLLMProviderUrl(apiKey.name as LLMProvider);
    const model = createModel(apiKey.name, apiKey.key || "", url, apiKey.model);

    logger.debug(`[AI Editor] Streaming for org: ${organizationId}, provider: ${apiKey.name}, model: ${apiKey.model}`);

    const result = streamText({
      model,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: 2048,
    });

    result.pipeTextStreamToResponse(res);
  } catch (error) {
    logger.error("AI editor command failed:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "AI editor command failed" });
    }
  }
}
