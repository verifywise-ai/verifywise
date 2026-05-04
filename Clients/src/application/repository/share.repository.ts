/* eslint-disable @typescript-eslint/no-explicit-any */
import { apiServices } from "../../infrastructure/api/networkServices";

export interface CreateShareLinkParams {
  resource_type: string;
  resource_id: number;
  settings?: {
    shareAllFields: boolean;
    allowDataExport: boolean;
    allowViewersToOpenRecords: boolean;
    displayToolbar: boolean;
  };
  expires_at?: Date;
}

export interface UpdateShareLinkParams {
  settings?: {
    shareAllFields: boolean;
    allowDataExport: boolean;
    allowViewersToOpenRecords: boolean;
    displayToolbar: boolean;
  };
  is_enabled?: boolean;
  expires_at?: Date;
}

/**
 * Creates a new share link
 * POST /api/shares
 *
 * @param {CreateShareLinkParams} body - The share link data
 * @returns {Promise<any>} A promise that resolves to the created share link
 * @throws Will throw an error if the creation fails
 */
export async function createShareLink(body: CreateShareLinkParams): Promise<any> {
  const response = await apiServices.post("/shares", body);
  return response;
}

/**
 * Get all share links for a specific resource
 * GET /api/shares/:resourceType/:resourceId
 *
 * @param {string} resourceType - Type of resource (e.g., 'model', 'policy')
 * @param {number} resourceId - ID of the resource
 * @returns {Promise<any>} A promise that resolves to the list of share links
 * @throws Will throw an error if the request fails
 */
export async function getShareLinksForResource(
  resourceType: string,
  resourceId: number,
): Promise<any> {
  const response = await apiServices.get(`/shares/${resourceType}/${resourceId}`);
  return response;
}

/**
 * Get a share link by token (public endpoint)
 * GET /api/shares/token/:token
 *
 * @param {string} token - The share token
 * @returns {Promise<any>} A promise that resolves to the share link data
 * @throws Will throw an error if the request fails
 */
export async function getShareLinkByToken(token: string): Promise<any> {
  const response = await apiServices.get(`/shares/token/${token}`);
  return response;
}

/**
 * Update a share link
 * PATCH /api/shares/:id
 *
 * @param {number} id - The share link ID
 * @param {UpdateShareLinkParams} body - The update data
 * @returns {Promise<any>} A promise that resolves to the updated share link
 * @throws Will throw an error if the update fails
 */
export async function updateShareLink(id: number, body: UpdateShareLinkParams): Promise<any> {
  const response = await apiServices.patch(`/shares/${id}`, body);
  return response;
}

/**
 * Delete a share link
 * DELETE /api/shares/:id
 *
 * @param {number} id - The share link ID
 * @returns {Promise<any>} A promise that resolves to the deletion confirmation
 * @throws Will throw an error if the deletion fails
 */
export async function deleteShareLink(id: number): Promise<any> {
  const response = await apiServices.delete(`/shares/${id}`);
  return response;
}
