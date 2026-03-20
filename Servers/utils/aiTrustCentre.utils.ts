import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import { IAITrustCentreOverview } from "../domain.layer/interfaces/i.aiTrustCentreOverview";
import { AITrustCenterResourcesModel } from "../domain.layer/models/aiTrustCentre/aiTrustCentreResources.model";
import { AITrustCenterSubprocessorsModel } from "../domain.layer/models/aiTrustCentre/aiTrustCentreSubprocessors.model";
import { IAITrustCentreResources } from "../domain.layer/interfaces/i.aiTrustCentreResources";
import { IAITrustCentreSubprocessors } from "../domain.layer/interfaces/i.aiTrustCentreSubprocessors";
import { IAITrustCentrePublic } from "../domain.layer/interfaces/i.aiTrustCentrePublic";
import { ValidationException } from "../domain.layer/exceptions/custom.exception";
import { deleteFileById, getFileById } from "./fileUpload.utils";

export const getIsVisibleQuery = async (organizationId: number) => {
  try {
    const result = (await sequelize.query(
      `SELECT visible FROM ai_trust_center WHERE organization_id = :organizationId LIMIT 1;`,
      { replacements: { organizationId } }
    )) as [{ visible: boolean }[], number];
    return result[0][0]?.visible || false;
  } catch (error) {
    return false;
  }
};

export const getCompanyLogoQuery = async (organizationId: number) => {
  const result = (await sequelize.query(
    `SELECT f.content, f.type FROM ai_trust_center AS ai
     INNER JOIN files f ON ai.logo = f.id AND f.organization_id = :organizationId
     WHERE ai.organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId } }
  )) as [{ content: Buffer }[], number];

  return result[0][0] || null;
};

export const getAITrustCentrePublicPageQuery = async (organizationId: number) => {
  const output: Partial<IAITrustCentrePublic> = {};
  const visible = (await sequelize.query(
    `SELECT intro_visible, compliance_badges_visible, company_description_visible, terms_and_contact_visible, resources_visible, subprocessor_visible
     FROM ai_trust_center WHERE organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId } }
  )) as [
    {
      intro_visible: boolean;
      compliance_badges_visible: boolean;
      company_description_visible: boolean;
      terms_and_contact_visible: boolean;
      resources_visible: boolean;
      subprocessor_visible: boolean;
    }[],
    number,
  ];

  type VisibleKeys =
    | "intro_visible"
    | "compliance_badges_visible"
    | "company_description_visible"
    | "terms_and_contact_visible"
    | "resources_visible"
    | "subprocessor_visible";
  const visibleRow = visible[0][0] as Record<VisibleKeys, boolean>;

  const keysQueryMap = {
    intro_visible: `
      SELECT CASE
        WHEN purpose_visible THEN purpose_text
        ELSE NULL
      END AS purpose,
      CASE
        WHEN our_statement_visible THEN our_statement_text
        ELSE NULL
      END AS statement,
      CASE
        WHEN our_mission_visible THEN our_mission_text
        ELSE NULL
      END AS mission
      FROM ai_trust_center_intro WHERE organization_id = :organizationId LIMIT 1;
    `,
    compliance_badges_visible: `
      SELECT SOC2_Type_I, SOC2_Type_II, ISO_27001, ISO_42001, CCPA, GDPR, HIPAA, EU_AI_Act
      FROM ai_trust_center_compliance_badges WHERE organization_id = :organizationId LIMIT 1;
    `,
    company_description_visible: `
      SELECT CASE
        WHEN background_visible THEN background_text
        ELSE NULL
      END AS background,
      CASE
        WHEN core_benefits_visible THEN core_benefits_text
        ELSE NULL
      END AS core_benefits,
      CASE
        WHEN compliance_doc_visible THEN compliance_doc_text
        ELSE NULL
      END AS compliance_doc
      FROM ai_trust_center_company_description WHERE organization_id = :organizationId LIMIT 1;
    `,
    terms_and_contact_visible: `
      SELECT CASE
        WHEN terms_visible THEN terms_text
        ELSE NULL
      END AS terms,
      CASE
        WHEN privacy_visible THEN privacy_text
        ELSE NULL
      END AS privacy,
      CASE
        WHEN email_visible THEN email_text
        ELSE NULL
      END AS email
      FROM ai_trust_center_terms_and_contact WHERE organization_id = :organizationId LIMIT 1;
    `,
    resources_visible: `
      SELECT id, name, description, file_id, visible
      FROM ai_trust_center_resources WHERE organization_id = :organizationId AND visible = true ORDER BY id ASC;
    `,
    subprocessor_visible: `
      SELECT id, name, purpose, location, url
      FROM ai_trust_center_subprocessor WHERE organization_id = :organizationId ORDER BY id ASC;
    `,
  };

  for (let key of Object.keys(visibleRow) as VisibleKeys[]) {
    if (visibleRow[key] === true) {
      const query = keysQueryMap[key];
      const result = (await sequelize.query(query, { replacements: { organizationId } })) as [any[], number];
      const field = key.replace("_visible", "") as keyof IAITrustCentrePublic;
      if (key === "resources_visible" || key === "subprocessor_visible") {
        output[field as "resources" | "subprocessors"] = result[0] || [];
      } else {
        output[field] = result[0][0] || {};
      }
    }
  }

  const infoQuery = (await sequelize.query(
    `SELECT title, header_color, logo FROM ai_trust_center WHERE organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId } }
  )) as [{ title: string; header_color: string; logo: number }[], number];

  output["info"] = infoQuery[0][0] || {};

  return output;
};

export const getAITrustCentrePublicResourceByIdQuery = async (
  organizationId: number,
  id: number
) => {
  const visible = (await sequelize.query(
    `SELECT visible, file_id FROM ai_trust_center_resources WHERE organization_id = :organizationId AND id = :id;`,
    { replacements: { organizationId, id } }
  )) as [{ visible: boolean; file_id: number }[], number];
  if (visible[0].length === 0) {
    return null;
  }
  if (!visible[0][0].visible) {
    throw new ValidationException(
      "This resource is not visible to the public.",
      "Resource Not Visible",
      id
    );
  }
  const fileId = visible[0][0].file_id;
  const file = await getFileById(fileId, organizationId);
  if (!file) {
    return null;
  }
  return file;
};

export const getAITrustCentreOverviewQuery = async (organizationId: number) => {
  let updatedOverview: Partial<Record<keyof IAITrustCentreOverview, any>> = {};

  await Promise.all(
    [
      "intro",
      "compliance_badges",
      "company_description",
      "terms_and_contact",
      "info",
    ].map(async (section, _i) => {
      const query = `SELECT
      ${section === "info" ? "id, title, header_color, visible, intro_visible, compliance_badges_visible, company_description_visible, terms_and_contact_visible, resources_visible, subprocessor_visible, updated_at" : "*"}
    FROM ai_trust_center${section === "info" ? "" : `_${section}`} WHERE organization_id = :organizationId LIMIT 1;`;
      const result = (await sequelize.query(query, { replacements: { organizationId } })) as [any[], number];
      updatedOverview[section as keyof IAITrustCentreOverview] =
        result[0][0] || {};
    })
  );

  return updatedOverview as IAITrustCentreOverview;
};

export const getAITrustCentreResourcesQuery = async (organizationId: number) => {
  const query = `SELECT ai.*, f.filename FROM ai_trust_center_resources ai
    JOIN files f ON ai.file_id = f.id AND f.organization_id = :organizationId
    WHERE ai.organization_id = :organizationId
  ORDER BY ai.id ASC;`;
  const resources = (await sequelize.query(query, { replacements: { organizationId } })) as [
    (AITrustCenterResourcesModel & { filename: string })[],
    number,
  ];
  return resources[0];
};

export const getAITrustCentreSubprocessorsQuery = async (organizationId: number) => {
  const query = `SELECT * FROM ai_trust_center_subprocessor WHERE organization_id = :organizationId ORDER BY id ASC;`;
  const subprocessors = await sequelize.query(query, {
    replacements: { organizationId },
    mapToModel: true,
    model: AITrustCenterSubprocessorsModel,
  });
  return subprocessors;
};

export const createAITrustCentreResourceQuery = async (
  resource: Partial<IAITrustCentreResources>,
  organizationId: number,
  transaction: Transaction
) => {
  const query = `INSERT INTO ai_trust_center_resources (
    organization_id, name, description, file_id, visible) VALUES (:organizationId, :name, :description, :fileId, :visible) RETURNING *`;

  const result = await sequelize.query(query, {
    replacements: {
      organizationId,
      name: resource.name,
      description: resource.description,
      fileId: resource.file_id,
      visible: resource.visible,
    },
    mapToModel: true,
    model: AITrustCenterResourcesModel,
    transaction,
  });
  return result[0];
};

export const createAITrustCentreSubprocessorQuery = async (
  subprocessor: IAITrustCentreSubprocessors,
  organizationId: number,
  transaction: Transaction
) => {
  const query = `INSERT INTO ai_trust_center_subprocessor (
    organization_id, name, purpose, location, url) VALUES (:organizationId, :name, :purpose, :location, :url) RETURNING *`;
  const result = await sequelize.query(query, {
    replacements: {
      organizationId,
      name: subprocessor.name,
      purpose: subprocessor.purpose,
      location: subprocessor.location,
      url: subprocessor.url,
    },
    mapToModel: true,
    model: AITrustCenterSubprocessorsModel,
    transaction,
  });
  return result[0];
};

export const uploadCompanyLogoQuery = async (
  file: number,
  organizationId: number,
  transaction: Transaction
) => {
  const currentLogo = (await sequelize.query(
    `SELECT logo FROM ai_trust_center WHERE organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId }, transaction }
  )) as [{ logo: number }[], number];
  const deleteFileId = currentLogo[0][0]?.logo;

  const result = (await sequelize.query(
    `UPDATE ai_trust_center SET logo = :fileId WHERE organization_id = :organizationId RETURNING logo;`,
    { replacements: { organizationId, fileId: file }, transaction }
  )) as [{ file_id: number }[], number];

  if (deleteFileId) {
    await deleteFileById(deleteFileId, organizationId, transaction);
  }

  return result[0][0];
};

export const updateAITrustCentreOverviewQuery = async (
  overview: Partial<IAITrustCentreOverview>,
  organizationId: number,
  transaction: Transaction
) => {
  let updatedOverview: Partial<Record<keyof IAITrustCentreOverview, any>> = {};

  const metadata = [
    {
      key: "intro",
      tableName: "ai_trust_center_intro",
      columns: [
        "purpose_visible",
        "purpose_text",
        "our_statement_visible",
        "our_statement_text",
        "our_mission_visible",
        "our_mission_text",
      ],
    },
    {
      key: "compliance_badges",
      tableName: "ai_trust_center_compliance_badges",
      columns: [
        "soc2_type_i",
        "soc2_type_ii",
        "iso_27001",
        "iso_42001",
        "ccpa",
        "gdpr",
        "hipaa",
        "eu_ai_act",
      ],
    },
    {
      key: "company_description",
      tableName: "ai_trust_center_company_description",
      columns: [
        "background_visible",
        "background_text",
        "core_benefits_visible",
        "core_benefits_text",
        "compliance_doc_visible",
        "compliance_doc_text",
      ],
    },
    {
      key: "terms_and_contact",
      tableName: "ai_trust_center_terms_and_contact",
      columns: [
        "terms_visible",
        "terms_text",
        "privacy_visible",
        "privacy_text",
        "email_visible",
        "email_text",
      ],
    },
    {
      key: "info",
      tableName: "ai_trust_center",
      columns: [
        "title",
        "header_color",
        "visible",
        "intro_visible",
        "compliance_badges_visible",
        "company_description_visible",
        "terms_and_contact_visible",
        "resources_visible",
        "subprocessor_visible",
      ],
    },
  ];

  await Promise.all(
    metadata.map(async ({ key, tableName, columns }) => {
      if (overview[key as keyof IAITrustCentreOverview]) {
        const updatedData: Partial<Record<string, any>> = {};
        const setClause = columns
          .filter((f) => {
            const section = overview[key as keyof IAITrustCentreOverview];
            if (section && (section as Record<string, any>)[f] !== undefined) {
              updatedData[f] = (section as Record<string, any>)[
                f.toLowerCase()
              ];
              return true;
            }
            return false;
          })
          .map((f) => `${f} = :${f}`)
          .join(", ");
        let query = `UPDATE ${tableName} SET ${setClause} WHERE organization_id = :organizationId RETURNING ${columns.concat(["id"])};`;
        if (setClause.length === 0) {
          query = `SELECT ${columns} FROM ${tableName} WHERE organization_id = :organizationId;`;
        }
        updatedData.id = overview[key as keyof IAITrustCentreOverview]?.id;
        updatedData.organizationId = organizationId;
        const result = await sequelize.query(query, {
          replacements: updatedData,
          transaction,
        });
        updatedOverview[key as keyof IAITrustCentreOverview] = result[0];
      }
    })
  );

  return updatedOverview as IAITrustCentreOverview;
};

export const updateAITrustCentreResourceQuery = async (
  id: number,
  resource: Partial<IAITrustCentreResources>,
  deleteFile: number | undefined,
  organizationId: number,
  transaction: Transaction
) => {
  const updatedResource: Partial<Record<keyof IAITrustCentreResources, any>> & { organizationId?: number } =
    {};
  let toDeleteFile = false;

  if (resource.file_id !== undefined && deleteFile !== undefined) {
    // verify if the file exists in the resource before deleting
    const currentFile = (await sequelize.query(
      `SELECT file_id FROM ai_trust_center_resources WHERE organization_id = :organizationId AND id = :id;`,
      { replacements: { organizationId, id }, transaction }
    )) as [{ file_id: number }[], number];

    if (currentFile[0][0]?.file_id !== deleteFile) {
      throw new ValidationException(
        "The file ID provided does not match the current file ID for this resource.",
        "File ID Mismatch",
        deleteFile
      );
    }
    toDeleteFile = true;
  }

  const setClause = ["name", "description", "file_id", "visible"]
    .filter((f) => {
      if (resource[f as keyof typeof resource] !== undefined) {
        updatedResource[f as keyof typeof resource] =
          resource[f as keyof typeof resource];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");
  const query = `UPDATE ai_trust_center_resources SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
  updatedResource.id = id;
  updatedResource.organizationId = organizationId;
  const result = await sequelize.query(query, {
    replacements: updatedResource,
    mapToModel: true,
    model: AITrustCenterResourcesModel,
    transaction,
  });

  if (toDeleteFile) {
    await deleteFileById(deleteFile!, organizationId, transaction);
  }

  return result[0];
};

export const updateAITrustCentreSubprocessorQuery = async (
  id: number,
  subprocessor: Partial<IAITrustCentreSubprocessors>,
  organizationId: number,
  transaction: Transaction
) => {
  const updatedSubprocessor: Partial<
    Record<
      keyof {
        id: number;
        name: string;
        purpose: string;
        location: string;
        url: string;
      },
      any
    >
  > & { organizationId?: number } = {};

  const setClause = ["name", "purpose", "location", "url"]
    .filter((f) => {
      if (subprocessor[f as keyof typeof subprocessor] !== undefined) {
        updatedSubprocessor[f as keyof typeof subprocessor] =
          subprocessor[f as keyof typeof subprocessor];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");
  const query = `UPDATE ai_trust_center_subprocessor SET ${setClause} WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
  updatedSubprocessor.id = id;
  updatedSubprocessor.organizationId = organizationId;
  const result = await sequelize.query(query, {
    replacements: updatedSubprocessor,
    mapToModel: true,
    model: AITrustCenterSubprocessorsModel,
    transaction,
  });
  return result[0];
};

export const deleteAITrustCentreResourceQuery = async (
  id: number,
  organizationId: number
) => {
  const query = `DELETE FROM ai_trust_center_resources WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
  const result = await sequelize.query(query, {
    replacements: { organizationId, id },
  });
  return result[0].length > 0;
};

export const deleteAITrustCentreSubprocessorQuery = async (
  id: number,
  organizationId: number
) => {
  const query = `DELETE FROM ai_trust_center_subprocessor WHERE organization_id = :organizationId AND id = :id RETURNING *;`;
  const result = await sequelize.query(query, {
    replacements: { organizationId, id },
  });
  return result[0].length > 0;
};

export const deleteCompanyLogoQuery = async (
  organizationId: number,
  transaction: Transaction
) => {
  const currentLogo = (await sequelize.query(
    `SELECT logo FROM ai_trust_center WHERE organization_id = :organizationId LIMIT 1;`,
    { replacements: { organizationId }, transaction }
  )) as [{ logo: number }[], number];

  const deleteFileId = currentLogo[0][0]?.logo;

  const result = (await sequelize.query(
    `UPDATE ai_trust_center SET logo = NULL WHERE organization_id = :organizationId RETURNING logo;`,
    { replacements: { organizationId }, transaction }
  )) as [{ logo: number }[], number];

  let deleted = false;
  if (deleteFileId) {
    deleted = await deleteFileById(deleteFileId, organizationId, transaction);
  }

  return deleted && result[0][0].logo === null;
};
