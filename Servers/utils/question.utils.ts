import { QuestionModel } from "../domain.layer/models/question/question.model";
import { sequelize } from "../database/db";
import { deleteFileById } from "./fileUpload.utils";
import { Request } from "express";
import { QueryTypes, Transaction } from "sequelize";
import { IQuestion } from "../domain.layer/interfaces/I.question";
import {
  getEvidenceFilesForEntity,
  getEvidenceFilesForEntities,
  createFileEntityLink,
  deleteFileEntityLink,
} from "./files/evidenceFiles.utils";

// Framework type for generic assessment questions
const FRAMEWORK_TYPE = "generic_assessment";
const ENTITY_TYPE = "question";

export const getAllQuestionsQuery = async (
  organizationId: number
): Promise<(IQuestion & { evidence_files: Object[] })[]> => {
  const questions = await sequelize.query(
    `SELECT * FROM questions WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: QuestionModel,
    }
  );

  // Batch fetch evidence files from file_entity_links
  const questionIds = questions.map((q) => q.id!);
  let filesMap = new Map<number, any[]>();

  if (questionIds.length > 0) {
    filesMap = await getEvidenceFilesForEntities(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      questionIds,
      "evidence"
    );
  }

  // Attach evidence_files to each question for backward compatibility
  const questionsUpdated = questions.map((question) => {
    const evidenceFiles = filesMap.get(question.id!) || [];
    return {
      ...question.dataValues,
      evidence_files: evidenceFiles.map((f) => ({ id: f.id, filename: f.filename })),
    };
  }) as (QuestionModel & { evidence_files: Object[] })[];

  return questionsUpdated;
};

export const getQuestionByIdQuery = async (
  id: number,
  organizationId: number
): Promise<IQuestion & { evidence_files: Object[] }> => {
  const result = await sequelize.query(
    `SELECT * FROM questions WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: QuestionModel,
    }
  );

  if (!result.length) {
    return null as any;
  }

  // Fetch evidence_files from file_entity_links
  const evidenceFiles = await getEvidenceFilesForEntity(
    organizationId,
    FRAMEWORK_TYPE,
    ENTITY_TYPE,
    id,
    "evidence"
  );

  return {
    ...result[0].dataValues,
    evidence_files: evidenceFiles.map((f) => ({ id: f.id, filename: f.fileName })),
  } as QuestionModel & { evidence_files: Object[] };
};

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size?: number;
}

export type RequestWithFile = Omit<Request, "file" | "files"> & {
  files?:
    | UploadedFile[]
    | {
        [key: string]: UploadedFile[];
      };
  file?: UploadedFile;
};

export const createNewQuestionQuery = async (
  question: QuestionModel,
  organizationId: number,
  transaction: Transaction
): Promise<QuestionModel> => {
  const result = await sequelize.query(
    `INSERT INTO questions (
      organization_id, subtopic_id, question, answer_type, evidence_required,
      hint, is_required, priority_level, answer
    ) VALUES (
      :organizationId, :subtopic_id, :question, :answer_type, :evidence_required,
      :hint, :is_required, :priority_level, :answer
    ) RETURNING *`,
    {
      replacements: {
        organizationId,
        subtopic_id: question.subtopic_id,
        question: question.question,
        answer_type: question.answer_type,
        evidence_required: question.evidence_required,
        hint: question.hint,
        is_required: question.is_required,
        priority_level: question.priority_level,
        answer: question.answer,
      },
      mapToModel: true,
      model: QuestionModel,
      transaction,
    }
  );

  // Attach empty array for backward compatibility
  (result[0] as any).evidence_files = [];

  return result[0];
};

export const addFileToQuestion = async (
  id: number,
  uploadedFiles: {
    id: string;
    fileName: string;
    project_id: number;
    uploaded_by: number;
    uploaded_time: Date;
  }[],
  deletedFiles: number[],
  organizationId: number,
  transaction: Transaction
): Promise<QuestionModel> => {
  // Delete file entity links for deleted files
  for (const fileId of deletedFiles) {
    await deleteFileEntityLink(
      organizationId,
      fileId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      id,
      transaction
    );
  }

  // Create file entity links for new uploaded files
  for (const file of uploadedFiles) {
    const fileId = typeof file.id === "string" ? parseInt(file.id) : file.id;
    await createFileEntityLink(
      organizationId,
      fileId as number,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      id,
      "evidence",
      file.project_id,
      transaction
    );
  }

  // Fetch the question with updated files
  const result = await sequelize.query(
    `SELECT * FROM questions WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: QuestionModel,
      transaction,
    }
  );

  // Fetch evidence_files for response
  const evidenceFiles = await getEvidenceFilesForEntity(
    organizationId,
    FRAMEWORK_TYPE,
    ENTITY_TYPE,
    id,
    "evidence"
  );

  (result[0] as any).evidence_files = evidenceFiles;

  return result[0];
};

export const updateQuestionByIdQuery = async (
  id: number,
  question: Partial<QuestionModel>,
  organizationId: number,
  transaction: Transaction
): Promise<QuestionModel | null> => {
  const updateQuestion: Partial<Record<keyof QuestionModel, any>> & {
    organizationId?: number;
  } = {};
  const setClause = ["answer", "status"]
    .filter((f) => {
      if (question[f as keyof QuestionModel] !== undefined) {
        updateQuestion[f as keyof QuestionModel] =
          question[f as keyof QuestionModel];
        if (f === "answer" && !question[f]) {
          updateQuestion[f as keyof QuestionModel] = "";
        }
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  if (!setClause) {
    // No fields to update, just fetch current state
    const result = await sequelize.query(
      `SELECT * FROM questions WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        mapToModel: true,
        model: QuestionModel,
        transaction,
      }
    );

    if (!result.length) return null;

    // Fetch evidence_files for response
    const evidenceFiles = await getEvidenceFilesForEntity(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      id,
      "evidence"
    );

    (result[0] as any).evidence_files = evidenceFiles;

    return result[0];
  }

  const query = `UPDATE questions SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updateQuestion.id = id;
  updateQuestion.organizationId = organizationId;

  const result = await sequelize.query(query, {
    replacements: updateQuestion,
    mapToModel: true,
    model: QuestionModel,
    transaction,
  });

  if (!result.length) return null;

  // Fetch evidence_files for response (backward compatibility)
  const evidenceFiles = await getEvidenceFilesForEntity(
    organizationId,
    FRAMEWORK_TYPE,
    ENTITY_TYPE,
    id,
    "evidence"
  );

  (result[0] as any).evidence_files = evidenceFiles;

  return result[0];
};

export const deleteQuestionByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  // First get the linked files so we can delete them after
  const linkedFiles = await getEvidenceFilesForEntity(
    organizationId,
    FRAMEWORK_TYPE,
    ENTITY_TYPE,
    id,
    "evidence"
  );

  // Clean up file_entity_links first
  await sequelize.query(
    `DELETE FROM file_entity_links
     WHERE organization_id = :organizationId
       AND framework_type = :frameworkType
       AND entity_type = :entityType
       AND entity_id = :entityId`,
    {
      replacements: {
        organizationId,
        frameworkType: FRAMEWORK_TYPE,
        entityType: ENTITY_TYPE,
        entityId: id,
      },
      transaction,
    }
  );

  const result = await sequelize.query(
    `DELETE FROM questions WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: QuestionModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );

  // Delete the actual files
  if (result.length && linkedFiles.length > 0) {
    await Promise.all(
      linkedFiles.map(async (f) => {
        const fileId = typeof f.id === 'string' ? parseInt(f.id) : f.id;
        await deleteFileById(fileId, organizationId, transaction);
      })
    );
  }

  return result.length > 0;
};

export const getQuestionBySubTopicIdQuery = async (
  subTopicId: number,
  organizationId: number
): Promise<IQuestion[]> => {
  const result = await sequelize.query(
    `SELECT * FROM questions WHERE organization_id = :organizationId AND subtopic_id = :subtopic_id ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, subtopic_id: subTopicId },
      mapToModel: true,
      model: QuestionModel,
    }
  );

  // Batch fetch evidence files
  const questionIds = result.map((q) => q.id!);
  let filesMap = new Map<number, any[]>();

  if (questionIds.length > 0) {
    filesMap = await getEvidenceFilesForEntities(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      questionIds,
      "evidence"
    );
  }

  // Attach evidence_files for backward compatibility
  for (const question of result) {
    (question as any).evidence_files = filesMap.get(question.id!) || [];
  }

  return result;
};

export const getQuestionByTopicIdQuery = async (
  topicId: number,
  organizationId: number
): Promise<IQuestion[]> => {
  const result = await sequelize.query(
    `SELECT * FROM questions WHERE organization_id = :organizationId AND subtopic_id IN (SELECT id FROM subtopics WHERE organization_id = :organizationId AND topic_id = :topic_id) ORDER BY created_at DESC, id ASC;`,
    {
      replacements: { organizationId, topic_id: topicId },
      mapToModel: true,
      model: QuestionModel,
    }
  );

  // Batch fetch evidence files
  const questionIds = result.map((q) => q.id!);
  let filesMap = new Map<number, any[]>();

  if (questionIds.length > 0) {
    filesMap = await getEvidenceFilesForEntities(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      questionIds,
      "evidence"
    );
  }

  // Attach evidence_files for backward compatibility
  for (const question of result) {
    (question as any).evidence_files = filesMap.get(question.id!) || [];
  }

  return result;
};

export const createNewQuestionsQuery = async (
  subTopicId: number,
  questions: {
    order_no: number;
    question: string;
    hint: string;
    priority_level: string;
    answer_type: string;
    input_type: string;
    evidence_required: boolean;
    isrequired: boolean;
    evidence_files: never[];
    dropdown_options: never[];
    answer: string;
  }[],
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction
) => {
  let query = `
    INSERT INTO questions(
      organization_id, subtopic_id, question, answer_type, evidence_required,
      hint, is_required, priority_level, answer, order_no, input_type
    ) VALUES (
      :organizationId, :subtopic_id, :question, :answer_type, :evidence_required,
      :hint, :is_required, :priority_level, :answer, :order_no, :input_type
    ) RETURNING *`;
  let createdQuestions: QuestionModel[] = [];
  for (let question of questions) {
    const result = await sequelize.query(query, {
      replacements: {
        organizationId,
        subtopic_id: subTopicId,
        question: question.question,
        answer_type: question.answer_type,
        evidence_required: question.evidence_required,
        hint: question.hint,
        is_required: question.isrequired,
        priority_level: question.priority_level,
        answer: enable_ai_data_insertion ? question.answer : null,
        order_no: question.order_no || null,
        input_type: question.input_type,
      },
      mapToModel: true,
      model: QuestionModel,
      transaction,
    });

    // Attach empty array for backward compatibility
    (result[0] as any).evidence_files = [];

    createdQuestions = createdQuestions.concat(result);
  }
  return createdQuestions;
};
