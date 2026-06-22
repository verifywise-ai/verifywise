import {
  getNotesByEntityQuery,
  getNoteByIdQuery,
  getNotesByAuthorQuery,
  createNewNoteQuery,
  updateNoteContentQuery,
  deleteNoteByIdQuery,
} from "../../utils/notes.utils";
import { NotesModel } from "../../domain.layer/models/notes/notes.model";
import { sequelize } from "../../database/db";
import { QueryTypes } from "sequelize";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import logger from "../../utils/logger/fileLogger";

interface FetchNotesParams {
  entity_type?: string;
  entity_id?: string;
  author_id?: number;
  limit?: number;
}

const fetchNotes = async (params: FetchNotesParams, organizationId: number): Promise<any[]> => {
  try {
    let notes: any[] = [];

    if (params.entity_type && params.entity_id) {
      // Fetch by entity
      notes = await getNotesByEntityQuery(params.entity_type, params.entity_id, organizationId);
    } else if (params.author_id) {
      // Fetch by author
      notes = await getNotesByAuthorQuery(params.author_id, organizationId);
    } else {
      // Fetch all notes for the organization
      const result = await sequelize.query(
        `SELECT n.*, u.name as "author_name", u.surname as "author_surname", u.email as "author_email"
         FROM notes n
         LEFT JOIN users u ON n.author_id = u.id
         WHERE n.organization_id = :organization_id
         ORDER BY n.created_at DESC`,
        {
          replacements: { organization_id: organizationId },
          type: QueryTypes.SELECT,
        },
      );
      notes = result as any[];
    }

    // Apply additional filters
    if (params.entity_type && !params.entity_id) {
      notes = notes.filter(
        (n: any) => (n.attached_to || n.dataValues?.attached_to) === params.entity_type,
      );
    }

    // Limit results
    if (params.limit && params.limit > 0) {
      notes = notes.slice(0, params.limit);
    }

    // Return lightweight projections
    return notes.map((n: any) => {
      const data = n.dataValues || n;
      return {
        id: data.id,
        content:
          data.content && data.content.length > 200
            ? data.content.substring(0, 200) + "..."
            : data.content,
        author_id: data.author_id,
        author_name: data.author_name || data.author?.name,
        author_surname: data.author_surname || data.author?.surname,
        attached_to: data.attached_to,
        attached_to_id: data.attached_to_id,
        is_edited: data.is_edited,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    });
  } catch (error) {
    logger.error("Error fetching notes:", error);
    throw new Error(
      `Failed to fetch notes: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getNotesForEntity = async (
  params: { entity_type: string; entity_id: string },
  organizationId: number,
): Promise<any[]> => {
  try {
    const notes = await getNotesByEntityQuery(params.entity_type, params.entity_id, organizationId);

    return notes.map((n: any) => {
      const data = n.dataValues || n;
      return {
        id: data.id,
        content: data.content,
        author_id: data.author_id,
        author_name: data.author?.name,
        author_surname: data.author?.surname,
        author_email: data.author?.email,
        attached_to: data.attached_to,
        attached_to_id: data.attached_to_id,
        is_edited: data.is_edited,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    });
  } catch (error) {
    logger.error("Error fetching notes for entity:", error);
    throw new Error(
      `Failed to fetch notes for entity: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getNoteDetail = async (params: { note_id: number }, organizationId: number): Promise<any> => {
  try {
    const note = await getNoteByIdQuery(params.note_id, organizationId);

    if (!note) {
      return { error: `Note #${params.note_id} not found` };
    }

    const data = (note as any).dataValues || note;
    return {
      id: data.id,
      content: data.content,
      author_id: data.author_id,
      author_name: data.author?.name,
      author_surname: data.author?.surname,
      author_email: data.author?.email,
      attached_to: data.attached_to,
      attached_to_id: data.attached_to_id,
      is_edited: data.is_edited,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error) {
    logger.error("Error fetching note detail:", error);
    throw new Error(
      `Failed to fetch note detail: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

interface NotesAnalytics {
  totalNotes: number;
  notesByEntityType: { [entityType: string]: number };
  recentActivity: number;
}

const getNotesAnalytics = async (
  _params: Record<string, unknown>,
  organizationId: number,
): Promise<NotesAnalytics> => {
  try {
    // Count by entity type
    const entityCounts = await sequelize.query<{
      attached_to: string;
      count: string;
    }>(
      `SELECT attached_to, COUNT(*) as count
       FROM notes
       WHERE organization_id = :organization_id
       GROUP BY attached_to
       ORDER BY count DESC`,
      {
        replacements: { organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    );

    const notesByEntityType: { [entityType: string]: number } = {};
    let totalNotes = 0;
    for (const row of entityCounts) {
      const count = parseInt(row.count, 10);
      notesByEntityType[row.attached_to] = count;
      totalNotes += count;
    }

    // Recent activity (notes created in the last 7 days)
    const recentResult = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM notes
       WHERE organization_id = :organization_id
         AND created_at >= NOW() - INTERVAL '7 days'`,
      {
        replacements: { organization_id: organizationId },
        type: QueryTypes.SELECT,
      },
    );
    const recentActivity = parseInt(recentResult[0]?.count || "0", 10);

    return {
      totalNotes,
      notesByEntityType,
      recentActivity,
    };
  } catch (error) {
    logger.error("Error getting notes analytics:", error);
    throw new Error(
      `Failed to get notes analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools (Human Confirmation Flow) ---

const agentCreateNote = createWriteToolFn({
  toolName: "agent_create_note",
  warningLevel: "warning",
  descriptionFn: (params) => `Create note for ${params.entity_type} #${params.entity_id}`,
  executeFn: async (params, organizationId) => {
    const noteData = NotesModel.build({
      content: params.content as string,
      author_id: (params._userId as number) || 0,
      attached_to: params.entity_type as string,
      attached_to_id: params.entity_id as string,
      organization_id: organizationId,
      is_edited: false,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const result = await createNewNoteQuery(noteData, organizationId);
    const data = (result as any).dataValues || result;
    return {
      id: data.id,
      attached_to: data.attached_to,
      attached_to_id: data.attached_to_id,
      message: "Note created successfully",
    };
  },
});

const agentUpdateNote = createWriteToolFn({
  toolName: "agent_update_note",
  warningLevel: "warning",
  descriptionFn: (params) => `Update content of note #${params.note_id}`,
  executeFn: async (params, organizationId) => {
    const noteId = params.note_id as number;

    // Build a partial model with updated content
    const noteData = NotesModel.build({
      content: params.content as string,
      is_edited: true,
      updated_at: new Date(),
    } as any);

    const result = await updateNoteContentQuery(noteId, noteData, organizationId);
    const data = (result as any).dataValues || result;
    return {
      id: data.id,
      updated: true,
      message: "Note updated successfully",
    };
  },
});

const agentDeleteNote = createWriteToolFn({
  toolName: "agent_delete_note",
  warningLevel: "danger",
  descriptionFn: (params) => `Delete note #${params.note_id}`,
  executeFn: async (params, organizationId) => {
    const noteId = params.note_id as number;
    const rowsAffected = await deleteNoteByIdQuery(noteId, organizationId);

    if (rowsAffected === 0) {
      throw new Error(`Note #${noteId} not found or already deleted`);
    }

    return {
      id: noteId,
      deleted: true,
      message: "Note deleted successfully",
    };
  },
});

const availableNotesTools: any = {
  fetch_notes: fetchNotes,
  get_notes_for_entity: getNotesForEntity,
  get_note_detail: getNoteDetail,
  get_notes_analytics: getNotesAnalytics,
  agent_create_note: agentCreateNote,
  agent_update_note: agentUpdateNote,
  agent_delete_note: agentDeleteNote,
};

export { availableNotesTools };
