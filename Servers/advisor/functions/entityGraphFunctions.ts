import {
  getAnnotationsByUserQuery,
  getAnnotationByEntityQuery,
  deleteAnnotationByIdQuery,
} from "../../utils/entityGraphAnnotations.utils";
import { getViewsByUserQuery } from "../../utils/entityGraphViews.utils";
import { getGapRulesByUserQuery, getDefaultGapRules } from "../../utils/entityGraphGapRules.utils";
import { createWriteToolFn } from "../confirmation/createWriteTool";
import { sequelize } from "../../database/db";
import logger from "../../utils/logger/fileLogger";

// --- Read Tools ---

export interface FetchEntityAnnotationsParams {
  user_id?: number;
  entity_type?: string;
  limit?: number;
}

const fetchEntityAnnotations = async (
  params: FetchEntityAnnotationsParams,
  organizationId: number,
): Promise<any[]> => {
  try {
    if (!params.user_id) {
      // Fetch all annotations for the organization via raw SQL
      const [rows] = await sequelize.query(
        `SELECT id, content, user_id, entity_type, entity_id, created_at, updated_at
         FROM entity_graph_annotations
         WHERE organization_id = :organization_id
         ORDER BY updated_at DESC`,
        { replacements: { organization_id: organizationId } },
      );
      let annotations = rows as any[];

      if (params.entity_type) {
        annotations = annotations.filter((a: any) => a.entity_type === params.entity_type);
      }
      if (params.limit && params.limit > 0) {
        annotations = annotations.slice(0, params.limit);
      }

      return annotations.map((a: any) => ({
        id: a.id,
        entity_type: a.entity_type,
        entity_id: a.entity_id,
        content: a.content,
        user_id: a.user_id,
        updated_at: a.updated_at,
      }));
    }

    let annotations = await getAnnotationsByUserQuery(params.user_id, organizationId);

    if (params.entity_type) {
      annotations = annotations.filter((a) => a.entity_type === params.entity_type);
    }
    if (params.limit && params.limit > 0) {
      annotations = annotations.slice(0, params.limit);
    }

    return annotations.map((a) => ({
      id: a.id,
      entity_type: a.entity_type,
      entity_id: a.entity_id,
      content: a.content,
      user_id: a.user_id,
      updated_at: a.updated_at,
    }));
  } catch (error) {
    logger.error("Error fetching entity annotations:", error);
    throw new Error(
      `Failed to fetch entity annotations: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface GetEntityAnnotationParams {
  entity_type: string;
  entity_id: string;
}

const getEntityAnnotation = async (
  params: GetEntityAnnotationParams,
  organizationId: number,
): Promise<any> => {
  try {
    const annotation = await getAnnotationByEntityQuery(
      0, // userId=0 — we search by entity across all users
      params.entity_type,
      params.entity_id,
      organizationId,
    );

    if (!annotation) {
      // Try a broader search: find any annotation for this entity
      const [rows] = await sequelize.query(
        `SELECT id, content, user_id, entity_type, entity_id, created_at, updated_at
         FROM entity_graph_annotations
         WHERE entity_type = :entity_type AND entity_id = :entity_id
           AND organization_id = :organization_id
         LIMIT 1`,
        {
          replacements: {
            entity_type: params.entity_type,
            entity_id: params.entity_id,
            organization_id: organizationId,
          },
        },
      );
      if ((rows as any[]).length > 0) {
        const row = (rows as any[])[0];
        return {
          id: row.id,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          content: row.content,
          user_id: row.user_id,
          updated_at: row.updated_at,
        };
      }
      return null;
    }

    return {
      id: annotation.id,
      entity_type: annotation.entity_type,
      entity_id: annotation.entity_id,
      content: annotation.content,
      user_id: annotation.user_id,
      updated_at: annotation.updated_at,
    };
  } catch (error) {
    logger.error("Error getting entity annotation:", error);
    throw new Error(
      `Failed to get entity annotation: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface FetchEntityGraphViewsParams {
  user_id?: number;
  limit?: number;
}

const fetchEntityGraphViews = async (
  params: FetchEntityGraphViewsParams,
  organizationId: number,
): Promise<any[]> => {
  try {
    if (!params.user_id) {
      const [rows] = await sequelize.query(
        `SELECT id, name, user_id, config, created_at, updated_at
         FROM entity_graph_views
         WHERE organization_id = :organization_id
         ORDER BY updated_at DESC`,
        { replacements: { organization_id: organizationId } },
      );
      let views = rows as any[];

      if (params.limit && params.limit > 0) {
        views = views.slice(0, params.limit);
      }

      return views.map((v: any) => ({
        id: v.id,
        name: v.name,
        user_id: v.user_id,
        config: typeof v.config === "string" ? JSON.parse(v.config) : v.config,
        updated_at: v.updated_at,
      }));
    }

    let views = await getViewsByUserQuery(params.user_id, organizationId);

    if (params.limit && params.limit > 0) {
      views = views.slice(0, params.limit);
    }

    return views.map((v) => ({
      id: v.id,
      name: v.name,
      user_id: v.user_id,
      config: v.config,
      updated_at: v.updated_at,
    }));
  } catch (error) {
    logger.error("Error fetching entity graph views:", error);
    throw new Error(
      `Failed to fetch entity graph views: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

export interface GetGapRulesParams {
  user_id?: number;
}

const getGapRules = async (params: GetGapRulesParams, organizationId: number): Promise<any> => {
  try {
    if (!params.user_id) {
      // Return all gap rules for the organization
      const [rows] = await sequelize.query(
        `SELECT id, user_id, rules, created_at, updated_at
         FROM entity_graph_gap_rules
         WHERE organization_id = :organization_id
         LIMIT 1`,
        { replacements: { organization_id: organizationId } },
      );
      if ((rows as any[]).length > 0) {
        const row = (rows as any[])[0];
        return {
          id: row.id,
          user_id: row.user_id,
          rules: typeof row.rules === "string" ? JSON.parse(row.rules) : row.rules,
          updated_at: row.updated_at,
        };
      }
      return null;
    }

    const gapRules = await getGapRulesByUserQuery(params.user_id, organizationId);

    if (!gapRules) return null;

    return {
      id: gapRules.id,
      user_id: gapRules.user_id,
      rules: gapRules.rules,
      updated_at: gapRules.updated_at,
    };
  } catch (error) {
    logger.error("Error getting gap rules:", error);
    throw new Error(
      `Failed to get gap rules: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

const getDefaultGapRulesHandler = async (
  _params: Record<string, unknown>,
  _organizationId: number,
): Promise<any> => {
  try {
    return { rules: getDefaultGapRules() };
  } catch (error) {
    logger.error("Error getting default gap rules:", error);
    throw new Error(
      `Failed to get default gap rules: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

// --- Write Tools (Human Confirmation Flow) ---

const agentCreateEntityAnnotation = createWriteToolFn({
  toolName: "agent_create_entity_annotation",
  warningLevel: "warning",
  descriptionFn: (params) => `Create annotation on ${params.entity_type} #${params.entity_id}`,
  executeFn: async (params, organizationId) => {
    const [rows] = await sequelize.query(
      `INSERT INTO entity_graph_annotations
        (content, user_id, entity_type, entity_id, organization_id, created_at, updated_at)
       VALUES (:content, 0, :entity_type, :entity_id, :organization_id, NOW(), NOW())
       ON CONFLICT (user_id, entity_type, entity_id)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
       RETURNING id, entity_type, entity_id, content`,
      {
        replacements: {
          content: params.content as string,
          entity_type: params.entity_type as string,
          entity_id: params.entity_id as string,
          organization_id: organizationId,
        },
      },
    );
    const row = (rows as any[])[0];
    return {
      id: row.id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      message: "Annotation created successfully",
    };
  },
});

const agentDeleteEntityAnnotation = createWriteToolFn({
  toolName: "agent_delete_entity_annotation",
  warningLevel: "danger",
  descriptionFn: (params) => `Delete annotation #${params.annotation_id}`,
  executeFn: async (params, organizationId) => {
    const annotationId = params.annotation_id as number;
    const affected = await deleteAnnotationByIdQuery(annotationId, organizationId);
    if (affected === 0) {
      throw new Error(`Annotation #${annotationId} not found or already deleted`);
    }
    return { id: annotationId, deleted: true, message: "Annotation deleted successfully" };
  },
});

const agentSaveEntityGraphView = createWriteToolFn({
  toolName: "agent_save_entity_graph_view",
  warningLevel: "warning",
  descriptionFn: (params) => `Save entity graph view "${params.name}"`,
  executeFn: async (params, organizationId) => {
    const [rows] = await sequelize.query(
      `INSERT INTO entity_graph_views
        (name, user_id, organization_id, config, created_at, updated_at)
       VALUES (:name, 0, :organization_id, :config, NOW(), NOW())
       RETURNING id, name`,
      {
        replacements: {
          name: params.name as string,
          organization_id: organizationId,
          config: JSON.stringify(params.config),
        },
      },
    );
    const row = (rows as any[])[0];
    return { id: row.id, name: row.name, message: "View saved successfully" };
  },
});

const agentSaveGapRules = createWriteToolFn({
  toolName: "agent_save_gap_rules",
  warningLevel: "warning",
  descriptionFn: (_params) => `Save custom gap detection rules`,
  executeFn: async (params, organizationId) => {
    const rules = params.rules;
    const [rows] = await sequelize.query(
      `INSERT INTO entity_graph_gap_rules
        (user_id, organization_id, rules, created_at, updated_at)
       VALUES (0, :organization_id, :rules, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET rules = EXCLUDED.rules, updated_at = NOW()
       RETURNING id`,
      {
        replacements: {
          organization_id: organizationId,
          rules: JSON.stringify(rules),
        },
      },
    );
    const row = (rows as any[])[0];
    return { id: row.id, message: "Gap rules saved successfully" };
  },
});

const availableEntityGraphTools: any = {
  fetch_entity_annotations: fetchEntityAnnotations,
  get_entity_annotation: getEntityAnnotation,
  fetch_entity_graph_views: fetchEntityGraphViews,
  get_gap_rules: getGapRules,
  get_default_gap_rules: getDefaultGapRulesHandler,
  agent_create_entity_annotation: agentCreateEntityAnnotation,
  agent_delete_entity_annotation: agentDeleteEntityAnnotation,
  agent_save_entity_graph_view: agentSaveEntityGraphView,
  agent_save_gap_rules: agentSaveGapRules,
};

export { availableEntityGraphTools };
