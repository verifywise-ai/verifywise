import { DatasetModel } from "../domain.layer/models/dataset/dataset.model";
import { sequelize } from "../database/db";
import { Transaction } from "sequelize";
import { IDatasetModelInventory, IDatasetProject } from "../domain.layer/interfaces/i.dataset";

export const getAllDatasetsQuery = async (organizationId: number) => {
  const datasets = await sequelize.query(
    `SELECT * FROM datasets WHERE organization_id = :organizationId ORDER BY created_at DESC, id ASC`,
    {
      replacements: { organizationId },
      mapToModel: true,
      model: DatasetModel,
    }
  );

  // Fetch relationships for each dataset
  for (const dataset of datasets) {
    (dataset.dataValues as any).models = [];
    (dataset.dataValues as any).projects = [];

    // Get model relationships
    const modelRelations = (await sequelize.query(
      `SELECT model_inventory_id, relationship_type FROM dataset_model_inventories WHERE organization_id = :organizationId AND dataset_id = :dataset_id`,
      {
        replacements: { organizationId, dataset_id: dataset.id },
      }
    )) as [IDatasetModelInventory[], number];

    for (const relation of modelRelations[0]) {
      (dataset.dataValues as any).models.push(relation.model_inventory_id);
    }

    // Get project relationships
    const projectRelations = (await sequelize.query(
      `SELECT project_id FROM dataset_projects WHERE organization_id = :organizationId AND dataset_id = :dataset_id`,
      {
        replacements: { organizationId, dataset_id: dataset.id },
      }
    )) as [IDatasetProject[], number];

    for (const relation of projectRelations[0]) {
      (dataset.dataValues as any).projects.push(relation.project_id);
    }
  }

  return datasets;
};

export const getDatasetByIdQuery = async (id: number, organizationId: number) => {
  const datasets = await sequelize.query(
    `SELECT * FROM datasets WHERE organization_id = :organizationId AND id = :id`,
    {
      replacements: { organizationId, id },
      mapToModel: true,
      model: DatasetModel,
    }
  );

  if (!datasets.length) return null;

  const dataset = datasets[0];
  (dataset.dataValues as any).models = [];
  (dataset.dataValues as any).projects = [];

  // Get model relationships
  const modelRelations = (await sequelize.query(
    `SELECT model_inventory_id, relationship_type FROM dataset_model_inventories WHERE organization_id = :organizationId AND dataset_id = :dataset_id`,
    {
      replacements: { organizationId, dataset_id: dataset.id },
    }
  )) as [IDatasetModelInventory[], number];

  for (const relation of modelRelations[0]) {
    (dataset.dataValues as any).models.push(relation.model_inventory_id);
  }

  // Get project relationships
  const projectRelations = (await sequelize.query(
    `SELECT project_id FROM dataset_projects WHERE organization_id = :organizationId AND dataset_id = :dataset_id`,
    {
      replacements: { organizationId, dataset_id: dataset.id },
    }
  )) as [IDatasetProject[], number];

  for (const relation of projectRelations[0]) {
    (dataset.dataValues as any).projects.push(relation.project_id);
  }

  return dataset;
};

export const getDatasetsByModelIdQuery = async (
  modelId: number,
  organizationId: number
) => {
  const datasets = await sequelize.query(
    `SELECT d.*, dmi.relationship_type FROM datasets d
      JOIN dataset_model_inventories dmi ON d.id = dmi.dataset_id AND dmi.organization_id = :organizationId
      WHERE d.organization_id = :organizationId AND dmi.model_inventory_id = :model_id`,
    {
      replacements: { organizationId, model_id: modelId },
      mapToModel: true,
      model: DatasetModel,
    }
  );
  return datasets;
};

export const getDatasetsByProjectIdQuery = async (
  projectId: number,
  organizationId: number
) => {
  const datasets = await sequelize.query(
    `SELECT d.* FROM datasets d
      JOIN dataset_projects dp ON d.id = dp.dataset_id AND dp.organization_id = :organizationId
      WHERE d.organization_id = :organizationId AND dp.project_id = :project_id`,
    {
      replacements: { organizationId, project_id: projectId },
      mapToModel: true,
      model: DatasetModel,
    }
  );
  return datasets;
};

export const createNewDatasetQuery = async (
  dataset: DatasetModel,
  organizationId: number,
  models: number[],
  projects: number[],
  transaction: Transaction
) => {
  const created_at = new Date();

  try {
    const result = await sequelize.query(
      `INSERT INTO datasets (
        organization_id, name, description, version, owner, type, function, source, license, format,
        classification, contains_pii, pii_types, status, status_date,
        known_biases, bias_mitigation, collection_method, preprocessing_steps,
        documentation_data, is_demo, created_at, updated_at
      ) VALUES (
        :organization_id, :name, :description, :version, :owner, :type, :function, :source, :license, :format,
        :classification, :contains_pii, :pii_types, :status, :status_date,
        :known_biases, :bias_mitigation, :collection_method, :preprocessing_steps,
        :documentation_data, :is_demo, :created_at, :updated_at
      ) RETURNING *`,
      {
        replacements: {
          organization_id: organizationId,
          name: dataset.name,
          description: dataset.description,
          version: dataset.version,
          owner: dataset.owner,
          type: dataset.type,
          function: dataset.function,
          source: dataset.source,
          license: dataset.license || null,
          format: dataset.format || null,
          classification: dataset.classification,
          contains_pii: dataset.contains_pii,
          pii_types: dataset.pii_types || null,
          status: dataset.status,
          status_date: dataset.status_date,
          known_biases: dataset.known_biases || null,
          bias_mitigation: dataset.bias_mitigation || null,
          collection_method: dataset.collection_method || null,
          preprocessing_steps: dataset.preprocessing_steps || null,
          documentation_data: JSON.stringify(dataset.documentation_data || []),
          is_demo: dataset.is_demo || false,
          created_at: created_at,
          updated_at: created_at,
        },
        mapToModel: true,
        model: DatasetModel,
        transaction,
      }
    );

    const createdDataset = result[0];
    (createdDataset.dataValues as any).models = [];
    (createdDataset.dataValues as any).projects = [];

    // Create model relationships
    for (const modelId of models) {
      await sequelize.query(
        `INSERT INTO dataset_model_inventories (organization_id, dataset_id, model_inventory_id, relationship_type, created_at)
         VALUES (:organization_id, :dataset_id, :model_inventory_id, 'trained_on', NOW())`,
        {
          replacements: {
            organization_id: organizationId,
            dataset_id: createdDataset.id,
            model_inventory_id: modelId,
          },
          transaction,
        }
      );
      (createdDataset.dataValues as any).models.push(modelId);
    }

    // Create project relationships
    for (const projectId of projects) {
      await sequelize.query(
        `INSERT INTO dataset_projects (organization_id, dataset_id, project_id, created_at)
         VALUES (:organization_id, :dataset_id, :project_id, NOW())`,
        {
          replacements: {
            organization_id: organizationId,
            dataset_id: createdDataset.id,
            project_id: projectId,
          },
          transaction,
        }
      );
      (createdDataset.dataValues as any).projects.push(projectId);
    }

    return createdDataset;
  } catch (error) {
    console.error("Error creating new dataset:", error);
    throw error;
  }
};

export const updateDatasetByIdQuery = async (
  id: number,
  dataset: DatasetModel,
  models: number[],
  projects: number[],
  deleteModels: boolean,
  deleteProjects: boolean,
  organizationId: number,
  transaction: Transaction
) => {
  const updated_at = new Date();

  try {
    // Update the dataset record
    await sequelize.query(
      `UPDATE datasets SET
        name = :name,
        description = :description,
        version = :version,
        owner = :owner,
        type = :type,
        function = :function,
        source = :source,
        license = :license,
        format = :format,
        classification = :classification,
        contains_pii = :contains_pii,
        pii_types = :pii_types,
        status = :status,
        status_date = :status_date,
        known_biases = :known_biases,
        bias_mitigation = :bias_mitigation,
        collection_method = :collection_method,
        preprocessing_steps = :preprocessing_steps,
        documentation_data = :documentation_data,
        is_demo = :is_demo,
        updated_at = :updated_at
      WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: {
          organizationId,
          id,
          name: dataset.name,
          description: dataset.description,
          version: dataset.version,
          owner: dataset.owner,
          type: dataset.type,
          function: dataset.function,
          source: dataset.source,
          license: dataset.license || null,
          format: dataset.format || null,
          classification: dataset.classification,
          contains_pii: dataset.contains_pii,
          pii_types: dataset.pii_types || null,
          status: dataset.status,
          status_date: dataset.status_date,
          known_biases: dataset.known_biases || null,
          bias_mitigation: dataset.bias_mitigation || null,
          collection_method: dataset.collection_method || null,
          preprocessing_steps: dataset.preprocessing_steps || null,
          documentation_data: JSON.stringify(dataset.documentation_data || []),
          is_demo: dataset.is_demo || false,
          updated_at,
        },
        transaction,
      }
    );

    // Fetch the updated record
    const result = await sequelize.query(
      `SELECT * FROM datasets WHERE organization_id = :organizationId AND id = :id`,
      {
        replacements: { organizationId, id },
        mapToModel: true,
        model: DatasetModel,
        transaction,
      }
    );

    const updatedDataset = result[0];
    (updatedDataset.dataValues as any).models = [];
    (updatedDataset.dataValues as any).projects = [];

    // Update model relationships if provided
    if ((models && models.length > 0) || deleteModels) {
      // Delete existing model associations
      await sequelize.query(
        `DELETE FROM dataset_model_inventories WHERE organization_id = :organizationId AND dataset_id = :dataset_id`,
        {
          replacements: { organizationId, dataset_id: id },
          transaction,
        }
      );

      // Insert new model associations
      for (const modelId of models) {
        await sequelize.query(
          `INSERT INTO dataset_model_inventories (organization_id, dataset_id, model_inventory_id, relationship_type, created_at)
           VALUES (:organization_id, :dataset_id, :model_inventory_id, 'trained_on', NOW())`,
          {
            replacements: {
              organization_id: organizationId,
              dataset_id: id,
              model_inventory_id: modelId,
            },
            transaction,
          }
        );
        (updatedDataset.dataValues as any).models.push(modelId);
      }
    }

    // Update project relationships if provided
    if ((projects && projects.length > 0) || deleteProjects) {
      // Delete existing project associations
      await sequelize.query(
        `DELETE FROM dataset_projects WHERE organization_id = :organizationId AND dataset_id = :dataset_id`,
        {
          replacements: { organizationId, dataset_id: id },
          transaction,
        }
      );

      // Insert new project associations
      for (const projectId of projects) {
        await sequelize.query(
          `INSERT INTO dataset_projects (organization_id, dataset_id, project_id, created_at)
           VALUES (:organization_id, :dataset_id, :project_id, NOW())`,
          {
            replacements: {
              organization_id: organizationId,
              dataset_id: id,
              project_id: projectId,
            },
            transaction,
          }
        );
        (updatedDataset.dataValues as any).projects.push(projectId);
      }
    }

    return updatedDataset;
  } catch (error) {
    console.error("Error updating dataset:", error);
    throw error;
  }
};

export const deleteDatasetByIdQuery = async (
  id: number,
  organizationId: number,
  transaction: Transaction
) => {
  try {
    const result = (await sequelize.query(
      `DELETE FROM datasets WHERE organization_id = :organizationId AND id = :id RETURNING *`,
      {
        replacements: { organizationId, id },
        transaction,
      }
    )) as [DatasetModel[], number];

    return result[0][0];
  } catch (error) {
    console.error("Error deleting dataset:", error);
    throw error;
  }
};
