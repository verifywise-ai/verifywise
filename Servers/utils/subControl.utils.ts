import { SubcontrolModel } from "../domain.layer/models/subcontrol/subcontrol.model";
import { sequelize } from "../database/db";
import { UploadedFile } from "./question.utils";
import { uploadFile } from "./fileUpload.utils";
import { QueryTypes, Transaction } from "sequelize";
import { FileType } from "../domain.layer/models/file/file.model";
import { ISubcontrol } from "../domain.layer/interfaces/i.subcontrol";
import {
  getEvidenceFilesForEntity,
  getEvidenceFilesForEntities,
  createFileEntityLink,
  deleteFileEntityLink,
} from "./files/evidenceFiles.utils";

// Framework type for generic compliance subcontrols
const FRAMEWORK_TYPE = "generic_compliance";
const ENTITY_TYPE = "subcontrol";

export const getAllSubcontrolsQuery = async (
  organizationId: number
): Promise<ISubcontrol[]> => {
  const subcontrols = await sequelize.query(
    `SELECT * FROM subcontrols WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: SubcontrolModel,
    }
  );

  // Batch fetch evidence and feedback files from file_entity_links
  const subcontrolIds = subcontrols.map((s) => s.id!);
  let evidenceFilesMap = new Map<number, any[]>();
  let feedbackFilesMap = new Map<number, any[]>();

  if (subcontrolIds.length > 0) {
    evidenceFilesMap = await getEvidenceFilesForEntities(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      subcontrolIds,
      "evidence"
    );
    feedbackFilesMap = await getEvidenceFilesForEntities(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      subcontrolIds,
      "feedback"
    );
  }

  // Attach files to each subcontrol for backward compatibility
  for (const subcontrol of subcontrols) {
    (subcontrol as any).evidence_files = evidenceFilesMap.get(subcontrol.id!) || [];
    (subcontrol as any).feedback_files = feedbackFilesMap.get(subcontrol.id!) || [];
  }

  return subcontrols;
};

export const getAllSubcontrolsByControlIdQuery = async (
  controlId: number,
  organizationId: number
): Promise<ISubcontrol[]> => {
  const subcontrols = await sequelize.query(
    `SELECT * FROM subcontrols WHERE organization_id = :organizationId AND control_id = :id ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId, id: controlId },
      mapToModel: true,
      model: SubcontrolModel,
    }
  );

  // Batch fetch evidence and feedback files from file_entity_links
  const subcontrolIds = subcontrols.map((s) => s.id!);
  let evidenceFilesMap = new Map<number, any[]>();
  let feedbackFilesMap = new Map<number, any[]>();

  if (subcontrolIds.length > 0) {
    evidenceFilesMap = await getEvidenceFilesForEntities(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      subcontrolIds,
      "evidence"
    );
    feedbackFilesMap = await getEvidenceFilesForEntities(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      subcontrolIds,
      "feedback"
    );
  }

  // Attach files to each subcontrol for backward compatibility
  for (const subcontrol of subcontrols) {
    (subcontrol as any).evidence_files = evidenceFilesMap.get(subcontrol.id!) || [];
    (subcontrol as any).feedback_files = feedbackFilesMap.get(subcontrol.id!) || [];
  }

  return subcontrols;
};

export const getSubcontrolByIdQuery = async (
  id: number,
  organizationId: number
): Promise<ISubcontrol | null> => {
  const result = await sequelize.query(
    `SELECT * FROM subcontrols WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: SubcontrolModel,
    }
  );

  if (!result.length) return null;

  // Fetch evidence and feedback files from file_entity_links
  const evidenceFiles = await getEvidenceFilesForEntity(
    organizationId,
    FRAMEWORK_TYPE,
    ENTITY_TYPE,
    id,
    "evidence"
  );
  const feedbackFiles = await getEvidenceFilesForEntity(
    organizationId,
    FRAMEWORK_TYPE,
    ENTITY_TYPE,
    id,
    "feedback"
  );

  (result[0] as any).evidence_files = evidenceFiles;
  (result[0] as any).feedback_files = feedbackFiles;

  return result[0];
};

export const createNewSubcontrolQuery = async (
  controlId: number,
  subcontrol: Partial<SubcontrolModel>,
  project_id: number,
  user_id: number,
  organizationId: number,
  transaction: Transaction,
  evidenceFiles?: UploadedFile[],
  feedbackFiles?: UploadedFile[]
): Promise<SubcontrolModel> => {
  // Upload evidence files
  let uploadedEvidenceFiles: FileType[] = [];
  if (evidenceFiles && evidenceFiles.length > 0) {
    await Promise.all(
      evidenceFiles.map(async (file) => {
        const uploadedFile = await uploadFile(
          file,
          user_id,
          project_id,
          "Compliance tracker group",
          organizationId,
          transaction
        );
        uploadedEvidenceFiles.push({
          id: uploadedFile.id!.toString(),
          fileName: uploadedFile.filename,
          project_id: uploadedFile.project_id,
          uploaded_by: uploadedFile.uploaded_by,
          uploaded_time: uploadedFile.uploaded_time,
          type: uploadedFile.type,
          source: uploadedFile.source,
        });
      })
    );
  }

  // Upload feedback files
  let uploadedFeedbackFiles: FileType[] = [];
  if (feedbackFiles && feedbackFiles.length > 0) {
    await Promise.all(
      feedbackFiles.map(async (file) => {
        const uploadedFile = await uploadFile(
          file,
          user_id,
          project_id,
          "Compliance tracker group",
          organizationId,
          transaction
        );
        uploadedFeedbackFiles.push({
          id: uploadedFile.id!.toString(),
          fileName: uploadedFile.filename,
          project_id: uploadedFile.project_id,
          uploaded_by: uploadedFile.uploaded_by,
          uploaded_time: uploadedFile.uploaded_time,
          type: uploadedFile.type,
          source: uploadedFile.source,
        });
      })
    );
  }

  // Insert without JSONB file columns (now managed via file_entity_links)
  const result = await sequelize.query(
    `INSERT INTO subcontrols (
      organization_id, control_id, title, description, order_no, status,
      approver, risk_review, owner, reviewer, due_date,
      implementation_details, evidence_description, feedback_description
    ) VALUES (
      :organizationId, :control_id, :title, :description, :order_no, :status,
      :approver, :risk_review, :owner, :reviewer, :due_date,
      :implementation_details, :evidence_description, :feedback_description
    ) RETURNING *`,
    {
      replacements: {
        organizationId,
        control_id: controlId,
        title: subcontrol.title,
        description: subcontrol.description,
        order_no: subcontrol.order_no || null,
        status: subcontrol.status,
        approver: subcontrol.approver,
        risk_review: subcontrol.risk_review,
        owner: subcontrol.owner,
        reviewer: subcontrol.reviewer,
        due_date: subcontrol.due_date,
        implementation_details: subcontrol.implementation_details,
        evidence_description: subcontrol.evidence_description,
        feedback_description: subcontrol.feedback_description,
      },
      mapToModel: true,
      model: SubcontrolModel,
      transaction,
    }
  );

  const createdSubcontrol = result[0];

  // Create file entity links for evidence files
  for (const file of uploadedEvidenceFiles) {
    const fileId = typeof file.id === "string" ? parseInt(file.id) : file.id;
    await createFileEntityLink(
      organizationId,
      fileId as number,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      createdSubcontrol.id!,
      "evidence",
      project_id,
      transaction
    );
  }

  // Create file entity links for feedback files
  for (const file of uploadedFeedbackFiles) {
    const fileId = typeof file.id === "string" ? parseInt(file.id) : file.id;
    await createFileEntityLink(
      organizationId,
      fileId as number,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      createdSubcontrol.id!,
      "feedback",
      project_id,
      transaction
    );
  }

  // Attach files for response (backward compatibility)
  (createdSubcontrol as any).evidence_files = uploadedEvidenceFiles;
  (createdSubcontrol as any).feedback_files = uploadedFeedbackFiles;

  return createdSubcontrol;
};

export const updateSubcontrolByIdQuery = async (
  id: number,
  subcontrol: Partial<SubcontrolModel>,
  organizationId: number,
  transaction: Transaction,
  evidenceUploadedFiles: {
    id: string;
    fileName: string;
    project_id?: number;
    uploaded_by: number;
    uploaded_time: Date;
  }[] = [],
  feedbackUploadedFiles: {
    id: string;
    fileName: string;
    project_id?: number;
    uploaded_by: number;
    uploaded_time: Date;
  }[] = [],
  deletedFiles: number[] = []
): Promise<SubcontrolModel | null> => {
  // Delete file entity links for deleted files
  for (const fileId of deletedFiles) {
    // Delete from both evidence and feedback (we don't know which type the deleted file was)
    await deleteFileEntityLink(
      organizationId,
      fileId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      id,
      transaction
    );
  }

  // Create file entity links for new evidence files
  for (const file of evidenceUploadedFiles) {
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

  // Create file entity links for new feedback files
  for (const file of feedbackUploadedFiles) {
    const fileId = typeof file.id === "string" ? parseInt(file.id) : file.id;
    await createFileEntityLink(
      organizationId,
      fileId as number,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      id,
      "feedback",
      file.project_id,
      transaction
    );
  }

  // Build dynamic update clause (without JSONB file columns)
  const updateSubControl: Partial<Record<keyof SubcontrolModel, any>> & {
    organizationId?: number;
  } = {};
  const setClause = [
    "title",
    "description",
    "status",
    "approver",
    "risk_review",
    "owner",
    "reviewer",
    "due_date",
    "implementation_details",
    "evidence_description",
    "feedback_description",
  ]
    .filter((f) => {
      if (
        subcontrol[f as keyof SubcontrolModel] !== undefined &&
        subcontrol[f as keyof SubcontrolModel]
      ) {
        updateSubControl[f as keyof SubcontrolModel] =
          subcontrol[f as keyof SubcontrolModel];
        return true;
      }
      return false;
    })
    .map((f) => {
      return `${f} = :${f}`;
    })
    .join(", ");

  if (!setClause) {
    // No fields to update, just fetch current state
    const result = await sequelize.query(
      `SELECT * FROM subcontrols WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        mapToModel: true,
        model: SubcontrolModel,
        transaction,
      }
    );

    if (!result.length) return null;

    // Fetch files for response
    const evidenceFiles = await getEvidenceFilesForEntity(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      id,
      "evidence"
    );
    const feedbackFiles = await getEvidenceFilesForEntity(
      organizationId,
      FRAMEWORK_TYPE,
      ENTITY_TYPE,
      id,
      "feedback"
    );

    (result[0] as any).evidence_files = evidenceFiles;
    (result[0] as any).feedback_files = feedbackFiles;

    return result[0];
  }

  const query = `UPDATE subcontrols SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;

  updateSubControl.id = id;
  updateSubControl.organizationId = organizationId;

  const result = await sequelize.query(query, {
    replacements: updateSubControl,
    mapToModel: true,
    model: SubcontrolModel,
    transaction,
  });

  if (!result.length) return null;

  // Fetch files for response (backward compatibility)
  const evidenceFiles = await getEvidenceFilesForEntity(
    organizationId,
    FRAMEWORK_TYPE,
    ENTITY_TYPE,
    id,
    "evidence"
  );
  const feedbackFiles = await getEvidenceFilesForEntity(
    organizationId,
    FRAMEWORK_TYPE,
    ENTITY_TYPE,
    id,
    "feedback"
  );

  (result[0] as any).evidence_files = evidenceFiles;
  (result[0] as any).feedback_files = feedbackFiles;

  return result[0];
};

export const deleteSubcontrolByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
): Promise<Boolean> => {
  // Clean up file_entity_links first (both evidence and feedback)
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
    `DELETE FROM subcontrols WHERE organization_id = :organizationId AND id = :id RETURNING *`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: SubcontrolModel,
      type: QueryTypes.DELETE,
      transaction,
    }
  );
  return result.length > 0;
};

export const createNewSubControlsQuery = async (
  controlId: number,
  subControls: {
    order_no: number;
    title: string;
    description: string;
    implementation_details: string;
    evidence_description?: string;
    feedback_description?: string;
  }[],
  enable_ai_data_insertion: boolean,
  organizationId: number,
  transaction: Transaction
) => {
  let query = `INSERT INTO subcontrols(
      organization_id, title, description, control_id, order_no, implementation_details,
      evidence_description, feedback_description, status
    ) VALUES (
      :organizationId, :title, :description, :control_id, :order_no, :implementation_details,
      :evidence_description, :feedback_description, :status
    ) RETURNING *`;
  let createdSubControls: SubcontrolModel[] = [];
  for (let subControl of subControls) {
    const result = await sequelize.query(query, {
      replacements: {
        organizationId,
        title: subControl.title,
        description: subControl.description,
        control_id: controlId,
        order_no: subControl.order_no,
        implementation_details: enable_ai_data_insertion
          ? subControl.implementation_details
          : null,
        evidence_description:
          enable_ai_data_insertion && subControl.evidence_description
            ? subControl.evidence_description
            : null,
        feedback_description:
          enable_ai_data_insertion && subControl.feedback_description
            ? subControl.feedback_description
            : null,
        status: enable_ai_data_insertion ? "Waiting" : null,
      },
      mapToModel: true,
      model: SubcontrolModel,
      transaction,
    });

    // Attach empty arrays for backward compatibility
    (result[0] as any).evidence_files = [];
    (result[0] as any).feedback_files = [];

    createdSubControls = createdSubControls.concat(result);
  }
  return createdSubControls;
};
