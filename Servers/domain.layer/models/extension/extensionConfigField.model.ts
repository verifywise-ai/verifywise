import { QueryTypes } from "sequelize";
import { sequelize } from "../../../database/db";
import { IExtensionConfigField } from "../../interfaces/i.extension";

/**
 * Read-only accessor for `extension_config_fields`. Rows are seeded by
 * the extensions migration; runtime code lists fields for a given
 * extension_id to render the config form and validate config payloads.
 */
export class ExtensionConfigFieldModel {
  static async findByExtensionId(extension_id: number): Promise<IExtensionConfigField[]> {
    return (await sequelize.query(
      `SELECT * FROM extension_config_fields
        WHERE extension_id = :extension_id
        ORDER BY display_order, id;`,
      { replacements: { extension_id }, type: QueryTypes.SELECT },
    )) as IExtensionConfigField[];
  }

  static toJSON(f: IExtensionConfigField): Record<string, unknown> {
    return {
      id: f.id,
      fieldKey: f.field_key,
      fieldType: f.field_type,
      label: f.label,
      helpText: f.help_text,
      placeholder: f.placeholder,
      isRequired: f.is_required,
      isSecret: f.is_secret,
      defaultValue: f.default_value,
      displayOrder: f.display_order,
      options: f.options,
      validation: f.validation,
    };
  }
}
