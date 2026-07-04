import CustomAxios from "./customAxios";

export interface UploadDatasetResponse {
  message: string;
  path: string; // relative to EvaluationModule (e.g., data/uploads/{tenant}/{file}.json)
  filename: string;
  size: number;
  tenant: string;
  datasetType?: "chatbot" | "rag" | "agent";
  turnType?: "single-turn" | "multi-turn" | "simulated";
}

export type TurnType = "single-turn" | "multi-turn" | "simulated";

export interface ListedDataset {
  key: string;
  name: string;
  path: string;
  use_case: "chatbot" | "rag" | "agent";
  type?: "single-turn" | "multi-turn" | "simulated";
}

export type DatasetType = "chatbot" | "rag" | "agent";

// Single-turn prompt record
export interface SingleTurnPrompt {
  id: string;
  category: string;
  prompt: string;
  expected_output: string;
  expected_keywords?: string[];
  difficulty?: string;
  retrieval_context?: string[];
}

// Multi-turn conversation record
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface MultiTurnConversation {
  id?: string;
  scenario: string;
  expected_outcome?: string;
  turns: ConversationTurn[];
}

// Union type for both formats
export type DatasetPromptRecord = SingleTurnPrompt | MultiTurnConversation;

// Type guards
export function isSingleTurnPrompt(record: DatasetPromptRecord): record is SingleTurnPrompt {
  return "prompt" in record && typeof record.prompt === "string";
}

export function isMultiTurnConversation(
  record: DatasetPromptRecord,
): record is MultiTurnConversation {
  return "turns" in record && Array.isArray(record.turns);
}

class DeepEvalDatasetsService {
  async uploadDataset(
    file: File,
    datasetType: DatasetType = "chatbot",
    turnType: TurnType = "single-turn",
    orgId?: string,
  ): Promise<UploadDatasetResponse> {
    // org_id is required by the backend - fetch current org if not provided
    let finalOrgId = orgId;
    if (!finalOrgId) {
      // Dynamically import to avoid circular dependency
      const { deepEvalOrgsService } = await import("./deepEvalOrgsService");
      const { org } = await deepEvalOrgsService.getCurrentOrg();
      if (org) {
        finalOrgId = org.id;
      } else {
        // Try to get first org
        const { orgs } = await deepEvalOrgsService.getAllOrgs();
        if (orgs && orgs.length > 0) {
          finalOrgId = orgs[0].id;
          await deepEvalOrgsService.setCurrentOrg(finalOrgId);
        }
      }
    }

    if (!finalOrgId) {
      throw new Error("No organization available. Please create an organization first.");
    }

    const form = new FormData();
    form.append("dataset", file);
    form.append("dataset_type", datasetType);
    form.append("turn_type", turnType);
    form.append("org_id", finalOrgId);
    const res = await CustomAxios.post("/deepeval/datasets/upload", form);
    return res.data as UploadDatasetResponse;
  }

  async list(): Promise<Record<"chatbot" | "rag" | "agent", ListedDataset[]>> {
    const res = await CustomAxios.get("/deepeval/datasets/list");
    return res.data.datasets as Record<"chatbot" | "rag" | "agent", ListedDataset[]>;
  }

  async read(path: string): Promise<{ path: string; prompts: DatasetPromptRecord[] }> {
    const res = await CustomAxios.get("/deepeval/datasets/read", { params: { path } });
    return res.data as { path: string; prompts: DatasetPromptRecord[] };
  }

  async listUploads(): Promise<{
    uploads: { name: string; path: string; size: number; modifiedAt: number }[];
  }> {
    const res = await CustomAxios.get("/deepeval/datasets/uploads");
    return res.data as {
      uploads: { name: string; path: string; size: number; modifiedAt: number }[];
    };
  }

  async listMy(): Promise<{
    datasets: {
      id: number;
      name: string;
      path: string;
      size: number;
      promptCount: number;
      createdAt: string;
      datasetType?: DatasetType;
      turnType?: TurnType;
    }[];
  }> {
    const res = await CustomAxios.get("/deepeval/datasets/user");
    return res.data as {
      datasets: {
        id: number;
        name: string;
        path: string;
        size: number;
        promptCount: number;
        createdAt: string;
        datasetType?: DatasetType;
        turnType?: TurnType;
      }[];
    };
  }

  async deleteDatasets(paths: string[]): Promise<{ message: string; deleted: number }> {
    const res = await CustomAxios.delete("/deepeval/datasets/user", { data: { paths } });
    return res.data as { message: string; deleted: number };
  }
}

export const deepEvalDatasetsService = new DeepEvalDatasetsService();
