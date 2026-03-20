import { TopicModel } from "../domain.layer/models/topic/topic.model";
import { sequelize } from "../database/db";
import { createNewSubTopicsQuery } from "./subtopic.utils";
import { Topics } from "../structures/EU-AI-Act/assessment-tracker/topics.struct";
import { QueryTypes, Transaction } from "sequelize";
import { ITopic } from "../domain.layer/interfaces/i.topic";

export const getAllTopicsQuery = async (organizationId: number): Promise<ITopic[]> => {
  const topics = await sequelize.query(
    `SELECT * FROM topics WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: TopicModel,
    }
  );
  return topics;
};

export const getTopicByIdQuery = async (
  id: number,
  organizationId: number
): Promise<ITopic | null> => {
  const result = await sequelize.query(
    `SELECT * FROM topics WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: TopicModel,
    }
  );
  return result[0];
};

export const createNewTopicQuery = async (
  topic: TopicModel,
  organizationId: number,
  transaction: Transaction
): Promise<TopicModel> => {
  const result = await sequelize.query(
    `INSERT INTO topics (organization_id, assessment_id, title) VALUES (:organizationId, :assessment_id, :title) RETURNING *`,
    {
      replacements: {
        organizationId,
        assessment_id: topic.assessment_id,
        title: topic.title,
      },
      mapToModel: true,
      model: TopicModel,
      // type: QueryTypes.INSERT
      transaction,
    }
  );
  return result[0];
};

export const updateTopicByIdQuery = async (
  id: number,
  topic: Partial<TopicModel>,
  organizationId: number,
  transaction: Transaction
): Promise<TopicModel | null> => {
  const updateTopic: Partial<Record<keyof TopicModel, any>> & { organizationId?: number } = {};
  const setClause = ["title"]
    .filter((f) => {
      if (
        topic[f as keyof TopicModel] !== undefined &&
        topic[f as keyof TopicModel]
      ) {
        updateTopic[f as keyof TopicModel] = topic[f as keyof TopicModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE topics SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updateTopic.id = id;
  updateTopic.organizationId = organizationId;

  const result = await sequelize.query(query, {
    replacements: updateTopic,
    mapToModel: true,
    model: TopicModel,
    // type: QueryTypes.UPDATE,
    transaction,
  });

  return result[0];
};

export const deleteTopicByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  const result = await sequelize.query(
    `DELETE FROM topics WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: TopicModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const getTopicByAssessmentIdQuery = async (
  assessmentId: number,
  organizationId: number
): Promise<ITopic[]> => {
  const result = await sequelize.query(
    `SELECT * FROM topics WHERE organization_id = :organizationId AND assessment_id = :assessment_id ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, assessment_id: assessmentId },
      mapToModel: true,
      model: TopicModel,
    }
  );
  return result;
};

export const createNewTopicsQuery = async (
  assessmentId: number,
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction
) => {
  const createdTopics = [];
  let query = `INSERT INTO topics(organization_id, assessment_id, title, order_no) VALUES (:organizationId, :assessment_id, :title, :order_no) RETURNING *;`;
  for (let topicStruct of Topics) {
    const result = await sequelize.query(query, {
      replacements: {
        organizationId,
        assessment_id: assessmentId,
        title: topicStruct.title,
        order_no: topicStruct.order_no || null,
      },
      mapToModel: true,
      model: TopicModel,
      // type: QueryTypes.INSERT,
      transaction,
    });
    const topic_id = result[0].id!;
    const subTopics = await createNewSubTopicsQuery(
      topic_id,
      topicStruct.subtopics,
      enable_ai_data_insertion,
      organizationId,
      transaction
    );
    createdTopics.push({ ...result[0].dataValues, subTopics });
  }
  return createdTopics;
};
