/**
 * @fileoverview AI Detection Repository Registry API Client
 *
 * API functions for managing registered repositories and their scan schedules.
 *
 * @module repository/aiDetectionRepository
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import {
  AIDetectionRepository,
  CreateRepositoryInput,
  UpdateRepositoryInput,
  RepositoriesResponse,
} from "../../domain/ai-detection/repositoryTypes";
import { Scan, ScansResponse } from "../../domain/ai-detection/types";

const BASE_URL = "/ai-detection/repositories";

export async function getRepositories(
  page: number = 1,
  limit: number = 20
): Promise<RepositoriesResponse> {
  const response = await apiServices.get<{ data: RepositoriesResponse }>(
    `${BASE_URL}?page=${page}&limit=${limit}`
  );
  return response.data.data;
}

export async function getRepository(id: number): Promise<AIDetectionRepository> {
  const response = await apiServices.get<{ data: AIDetectionRepository }>(
    `${BASE_URL}/${id}`
  );
  return response.data.data;
}

export async function createRepository(
  input: CreateRepositoryInput
): Promise<AIDetectionRepository> {
  const response = await apiServices.post<{ data: AIDetectionRepository }>(
    BASE_URL,
    input
  );
  return response.data.data;
}

export async function updateRepository(
  id: number,
  input: UpdateRepositoryInput
): Promise<AIDetectionRepository> {
  const response = await apiServices.patch<{ data: AIDetectionRepository }>(
    `${BASE_URL}/${id}`,
    input
  );
  return response.data.data;
}

export async function deleteRepository(id: number): Promise<void> {
  await apiServices.delete(`${BASE_URL}/${id}`);
}

export async function triggerRepositoryScan(id: number): Promise<Scan> {
  const response = await apiServices.post<{ data: Scan }>(
    `${BASE_URL}/${id}/scan`
  );
  return response.data.data;
}

export async function getRepositoryScans(
  id: number,
  page: number = 1,
  limit: number = 20
): Promise<ScansResponse> {
  const response = await apiServices.get<{ data: ScansResponse }>(
    `${BASE_URL}/${id}/scans?page=${page}&limit=${limit}`
  );
  return response.data.data;
}

export async function generateWebhookSecret(
  id: number
): Promise<{ webhook_secret: string }> {
  const response = await apiServices.post<{ data: { webhook_secret: string } }>(
    `${BASE_URL}/${id}/webhook-secret`
  );
  return response.data.data;
}

export async function getRepositoryCount(): Promise<number> {
  const response = await apiServices.get<{ data: RepositoriesResponse }>(
    `${BASE_URL}?page=1&limit=1`
  );
  return response.data.data.pagination.total;
}
