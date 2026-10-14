import { apiServices } from "../../infrastructure/api/networkServices";
import type {
  Answers,
  ClassificationResult,
  ClassificationRun,
  Questionnaire,
} from "../../domain/types/euAiActClassification";

export async function getEuAiActQuestionnaire(): Promise<Questionnaire> {
  const response = await apiServices.get("/eu-ai-act-classification/questionnaire");
  return (response.data as { data: Questionnaire }).data;
}

export async function scoreEuAiActAnswers(answers: Answers): Promise<ClassificationResult> {
  const response = await apiServices.post("/eu-ai-act-classification/score", { answers });
  return (response.data as { data: ClassificationResult }).data;
}

export async function saveUseCaseClassification(
  projectId: number,
  answers: Answers,
): Promise<{ run: ClassificationRun; result: ClassificationResult }> {
  const response = await apiServices.post(`/projects/${projectId}/eu-ai-act-classification`, {
    answers,
  });
  return (response.data as { data: { run: ClassificationRun; result: ClassificationResult } }).data;
}

export async function getLatestUseCaseClassification(
  projectId: number,
): Promise<ClassificationRun | null> {
  const response = await apiServices.get(`/projects/${projectId}/eu-ai-act-classification`);
  return (response.data as { data: ClassificationRun | null }).data;
}
