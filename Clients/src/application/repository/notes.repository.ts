/**
 * @fileoverview Notes Repository
 *
 * Data access layer for Notes operations.
 * Handles all API calls related to note CRUD operations.
 *
 * @module repository/notes
 */

import { apiServices } from "../../infrastructure/api/networkServices";
import { APIError } from "../tools/error";

/**
 * Interface for Note data
 */
interface Note {
  id: number;
  content: string;
  author_id: number;
  author?: {
    id: number;
    name: string;
    surname: string;
    email: string;
  };
  created_at: string;
  updated_at: string;
  is_edited: boolean;
}

/**
 * Interface for create note request
 */
interface CreateNoteRequest {
  content: string;
  attached_to: string;
  attached_to_id: string;
}

/**
 * Interface for update note request
 */
interface UpdateNoteRequest {
  content: string;
}

/**
 * Extract data from API response
 * Handles various response structures and ensures safe data extraction
 */
function extractData<T>(response: { data: { data?: T; message?: string } }): T {
  // Handle standard response structure: { message: string, data: T }
  if (response?.data?.data !== undefined) {
    return response.data.data;
  }
  // Fallback: if data is directly in response.data (for 204 or edge cases)
  if (response?.data && !response.data.message) {
    return response.data as T;
  }
  // Return empty array as fallback for array types (safety net)
  return [] as T;
}

/**
 * Get notes for a specific entity
 *
 * @param attachedTo - Entity type (e.g., NIST_SUBCATEGORY)
 * @param attachedToId - Entity ID
 * @returns Promise resolving to array of notes
 */
export async function getNotes(attachedTo: string, attachedToId: string): Promise<Note[]> {
  try {
    const response = await apiServices.get<{ message: string; data: Note[] }>(
      `/notes?attachedTo=${attachedTo}&attachedToId=${attachedToId}`,
    );
    const notes = extractData<Note[]>(response);
    // Ensure we always return an array
    return Array.isArray(notes) ? notes : [];
  } catch (error: any) {
    // On error, return empty array instead of throwing (or handle based on error type)
    if (error?.response?.status === 204) {
      // 204 No Content is a valid response for empty notes
      return [];
    }
    throw new APIError("Failed to fetch notes", error?.response?.status, error);
  }
}

/**
 * Get a specific note by ID
 *
 * @param noteId - Note ID
 * @returns Promise resolving to note object
 */
export async function getNoteById(noteId: number): Promise<Note> {
  try {
    const response = await apiServices.get<{ message: string; data: Note }>(`/notes/${noteId}`);
    return extractData<Note>(response);
  } catch (error: any) {
    throw new APIError(`Failed to fetch note with ID ${noteId}`, error?.response?.status, error);
  }
}

/**
 * Create a new note
 *
 * @param input - Note data to create
 * @returns Promise resolving to created note object
 */
export async function createNote(input: CreateNoteRequest): Promise<Note> {
  try {
    const response = await apiServices.post<{ message: string; data: Note }>("/notes", input);
    return extractData<Note>(response);
  } catch (error: any) {
    throw new APIError("Failed to create note", error?.response?.status, error);
  }
}

/**
 * Update an existing note
 *
 * @param noteId - Note ID to update
 * @param input - Updated note data
 * @returns Promise resolving to updated note object
 */
export async function updateNote(noteId: number, input: UpdateNoteRequest): Promise<Note> {
  try {
    const response = await apiServices.put<{ message: string; data: Note }>(
      `/notes/${noteId}`,
      input,
    );
    return extractData<Note>(response);
  } catch (error: any) {
    throw new APIError(`Failed to update note with ID ${noteId}`, error?.response?.status, error);
  }
}

/**
 * Delete a note
 *
 * @param noteId - Note ID to delete
 * @returns Promise resolving when note is deleted
 */
export async function deleteNote(noteId: number): Promise<void> {
  try {
    await apiServices.delete(`/notes/${noteId}`);
  } catch (error: any) {
    throw new APIError(`Failed to delete note with ID ${noteId}`, error?.response?.status, error);
  }
}
