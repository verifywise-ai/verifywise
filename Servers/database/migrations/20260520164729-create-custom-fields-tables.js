"use strict";

/**
 * Custom Fields — tenant-scoped extensibility for user-managed entities.
 *
 * Two tables:
 *  - custom_field_definitions  schema (per org, per entity_type)
 *  - custom_field_values       data   (one row per definition × entity)
 *
 * Cross-tenant integrity is enforced at the DB layer via a composite FK
 * from values → definitions on (id, organization_id, entity_type). This
 * makes it impossible to attach a value to a definition that belongs to
 * a different organization or a different entity_type, even if the
 * application layer is buggy.
 */

const ALLOWED_ENTITY_TYPES = [
  "vendor",
  "policy",
  "project",
  "project_risk",
  "vendor_risk",
  "model_inventory",
  "task",
];
// Scope is intentionally limited to core governance entities. "control" and
// "subcontrol" are also excluded — they exist per-framework (controls_eu,
// annexcontrols_iso27001, ...), not as one table, so the cross-org FK +
// parent-entity guard can't honor them.

const ALLOWED_FIELD_TYPES = ["text", "number", "date", "boolean", "select", "multiselect", "user"];

const entityTypeList = ALLOWED_ENTITY_TYPES.map((t) => `'${t}'`).join(",");
const fieldTypeList = ALLOWED_FIELD_TYPES.map((t) => `'${t}'`).join(",");

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      console.log("Creating custom_field_definitions...");
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.custom_field_definitions (
          id              SERIAL PRIMARY KEY,
          organization_id INTEGER     NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          entity_type     VARCHAR(64) NOT NULL,
          field_key       VARCHAR(64) NOT NULL,
          label           VARCHAR(255) NOT NULL,
          field_type      VARCHAR(32) NOT NULL,
          options         JSONB,
          required        BOOLEAN     NOT NULL DEFAULT false,
          created_by      INTEGER     REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

          CONSTRAINT cfd_unique_per_org_entity
            UNIQUE (organization_id, entity_type, field_key),

          CONSTRAINT cfd_entity_type_allowed
            CHECK (entity_type IN (${entityTypeList})),

          CONSTRAINT cfd_field_type_allowed
            CHECK (field_type IN (${fieldTypeList})),

          CONSTRAINT cfd_field_key_format
            CHECK (field_key ~ '^[a-z][a-z0-9_]{0,63}$'),

          CONSTRAINT cfd_label_non_empty
            CHECK (char_length(btrim(label)) BETWEEN 1 AND 255),

          CONSTRAINT cfd_options_shape CHECK (
            (
              field_type IN ('select','multiselect')
              AND jsonb_typeof(options) = 'array'
              AND jsonb_array_length(options) > 0
            )
            OR
            (field_type NOT IN ('select','multiselect') AND options IS NULL)
          )
        );
        `,
        { transaction },
      );

      // Composite UNIQUE so that custom_field_values can FK into
      // (id, organization_id, entity_type) — guarantees org & entity_type match.
      await queryInterface.sequelize.query(
        `
        ALTER TABLE verifywise.custom_field_definitions
          ADD CONSTRAINT cfd_id_org_entity_uk
          UNIQUE (id, organization_id, entity_type);
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_cfd_org_entity
           ON verifywise.custom_field_definitions(organization_id, entity_type);`,
        { transaction },
      );

      console.log("Creating custom_field_values...");
      await queryInterface.sequelize.query(
        `
        CREATE TABLE IF NOT EXISTS verifywise.custom_field_values (
          id              SERIAL PRIMARY KEY,
          organization_id INTEGER     NOT NULL REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          definition_id   INTEGER     NOT NULL,
          entity_type     VARCHAR(64) NOT NULL,
          entity_id       INTEGER     NOT NULL,
          value           JSONB       NOT NULL,
          created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

          CONSTRAINT cfv_unique_per_definition_entity
            UNIQUE (definition_id, entity_id),

          CONSTRAINT cfv_entity_id_positive
            CHECK (entity_id > 0),

          CONSTRAINT cfv_entity_type_allowed
            CHECK (entity_type IN (${entityTypeList})),

          CONSTRAINT cfv_value_not_json_null
            CHECK (jsonb_typeof(value) <> 'null'),

          CONSTRAINT cfv_definition_consistency
            FOREIGN KEY (definition_id, organization_id, entity_type)
            REFERENCES verifywise.custom_field_definitions(id, organization_id, entity_type)
            ON DELETE CASCADE
        );
        `,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_cfv_lookup
           ON verifywise.custom_field_values(organization_id, entity_type, entity_id);`,
        { transaction },
      );

      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS idx_cfv_definition
           ON verifywise.custom_field_values(definition_id);`,
        { transaction },
      );

      await transaction.commit();
      console.log("Custom fields tables created.");
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS verifywise.custom_field_values;`, {
        transaction,
      });
      await queryInterface.sequelize.query(
        `DROP TABLE IF EXISTS verifywise.custom_field_definitions;`,
        { transaction },
      );
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
