import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { IExtension } from "../../interfaces/i.extension";

/**
 * Read-only accessor for the `extensions` catalog. Rows are seeded by
 * migration 20260811102307-extensions-migration.js; runtime code lists,
 * looks up by key, and looks up by id.
 */
export class ExtensionModel {
  static async findAll(category?: string): Promise<IExtension[]> {
    if (category) {
      return (await sequelize.query(
        `SELECT * FROM extensions WHERE category = :category ORDER BY id;`,
        { replacements: { category }, type: QueryTypes.SELECT },
      )) as IExtension[];
    }
    return (await sequelize.query(`SELECT * FROM extensions ORDER BY id;`, {
      type: QueryTypes.SELECT,
    })) as IExtension[];
  }

  static async findByKey(key: string): Promise<IExtension | null> {
    const rows = await sequelize.query(`SELECT * FROM extensions WHERE key = :key LIMIT 1;`, {
      replacements: { key },
      type: QueryTypes.SELECT,
    });
    return rows.length > 0 ? (rows[0] as IExtension) : null;
  }

  static async findById(id: number): Promise<IExtension | null> {
    const rows = await sequelize.query(`SELECT * FROM extensions WHERE id = :id LIMIT 1;`, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    return rows.length > 0 ? (rows[0] as IExtension) : null;
  }

  static toJSON(e: IExtension): Record<string, unknown> {
    return {
      id: e.id,
      key: e.key,
      name: e.name,
      displayName: e.display_name,
      description: e.description,
      longDescription: e.long_description,
      version: e.version,
      author: e.author,
      category: e.category,
      iconPath: e.icon_path,
      documentationUrl: e.documentation_url,
      supportUrl: e.support_url,
      requiresConfiguration: e.requires_configuration,
      features: e.features,
      tags: e.tags,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
    };
  }
}
