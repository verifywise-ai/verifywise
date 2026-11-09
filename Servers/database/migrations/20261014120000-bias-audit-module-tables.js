"use strict";

/**
 * Tables for the self-service LL 144 bias testing module.
 *
 * New tables only, per the guideline that a new feature adds tables rather
 * than modifying existing ones so it can be independently disabled.
 *
 * Two properties are enforced here rather than in application code:
 *
 *  - aedt_profiles is append-only and versioned, with a partial unique index
 *    allowing exactly one attested version per project-framework. Without the
 *    index, two concurrent attestations produce two current profiles and every
 *    run afterwards cites an ambiguous one.
 *
 *  - aedt_profile_answers stores one row per question with its own author and
 *    timestamp, and distinguishes "I don't know" from not-applicable from
 *    never-asked. A single JSON blob on the profile cannot carry that.
 *
 * Foreign keys are chosen so a project or organization CASCADE delete always
 * succeeds, and so a stance outlives the run it was generated from:
 *
 *  - bias_audit_runs.profile_id is NO ACTION, not RESTRICT. Deleting a project
 *    cascades to both the runs and the profiles; RESTRICT is checked
 *    immediately and would block the profile delete while the runs still
 *    exist, whereas NO ACTION is checked at statement end, after the cascade
 *    has removed the runs. Deleting a profile on its own while runs cite it
 *    is still refused.
 *
 *  - bias_audit_stances.run_id is nullable and ON DELETE SET NULL. A stance is
 *    an immutable record that carries its own profile_version and
 *    question_set_version, so it stays readable after its run is deleted.
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await run(`
        CREATE TYPE verifywise.enum_aedt_profiles_status
          AS ENUM ('draft', 'attested', 'superseded');
      `);

      await run(`
        CREATE TABLE verifywise.aedt_profiles (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL
            REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          framework_id INTEGER NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          status verifywise.enum_aedt_profiles_status NOT NULL DEFAULT 'draft',
          question_set_version INTEGER NOT NULL,
          attested_by_user_id INTEGER
            REFERENCES verifywise.users(id) ON DELETE SET NULL,
          attested_at TIMESTAMP WITH TIME ZONE,
          superseded_at TIMESTAMP WITH TIME ZONE,
          created_by INTEGER
            REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);

      await run(`
        CREATE UNIQUE INDEX aedt_profiles_project_framework_version_uq
          ON verifywise.aedt_profiles (project_id, framework_id, version);
      `);

      // Exactly one attested profile per project-framework.
      await run(`
        CREATE UNIQUE INDEX aedt_profiles_one_attested_uq
          ON verifywise.aedt_profiles (project_id, framework_id)
          WHERE status = 'attested';
      `);

      await run(`
        CREATE INDEX aedt_profiles_org_idx
          ON verifywise.aedt_profiles (organization_id);
      `);

      await run(`
        CREATE TABLE verifywise.aedt_profile_answers (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          profile_id INTEGER NOT NULL
            REFERENCES verifywise.aedt_profiles(id) ON DELETE CASCADE,
          question_key VARCHAR(128) NOT NULL,
          question_set_version INTEGER NOT NULL,
          answer_value TEXT,
          answer_notes TEXT,
          is_dont_know BOOLEAN NOT NULL DEFAULT FALSE,
          is_not_applicable BOOLEAN NOT NULL DEFAULT FALSE,
          answered_by_user_id INTEGER
            REFERENCES verifywise.users(id) ON DELETE SET NULL,
          answered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);

      await run(`
        CREATE UNIQUE INDEX aedt_profile_answers_profile_question_uq
          ON verifywise.aedt_profile_answers (profile_id, question_key);
      `);

      await run(`
        CREATE TABLE verifywise.bias_audit_runs (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL
            REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          profile_id INTEGER NOT NULL
            REFERENCES verifywise.aedt_profiles(id) ON DELETE NO ACTION,
          profile_version INTEGER NOT NULL,
          preset_id VARCHAR(64) NOT NULL,
          question_set_version INTEGER NOT NULL,
          job_description_key VARCHAR(64),
          metric VARCHAR(32) NOT NULL,
          threshold NUMERIC(5, 4),
          threshold_source VARCHAR(32),
          small_sample_exclusion NUMERIC(5, 4),
          data_basis_json JSONB,
          expiry_date DATE,
          expiry_trigger TEXT,
          readiness_score INTEGER,
          readiness_blocked_reason TEXT,
          result_json JSONB,
          result_schema_version INTEGER NOT NULL DEFAULT 1,
          gate_findings_json JSONB,
          order_findings_json JSONB,
          dataset_sha256 VARCHAR(64),
          dataset_retained BOOLEAN NOT NULL DEFAULT FALSE,
          row_count INTEGER,
          corpus_id INTEGER,
          created_by INTEGER
            REFERENCES verifywise.users(id) ON DELETE SET NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);

      await run(`
        CREATE INDEX bias_audit_runs_org_project_idx
          ON verifywise.bias_audit_runs (organization_id, project_id);
      `);

      await run(`
        CREATE INDEX bias_audit_runs_profile_idx
          ON verifywise.bias_audit_runs (profile_id);
      `);

      await run(`
        CREATE TABLE verifywise.bias_audit_stances (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL
            REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          run_id INTEGER
            REFERENCES verifywise.bias_audit_runs(id) ON DELETE SET NULL,
          version INTEGER NOT NULL DEFAULT 1,
          pdf_sha256 VARCHAR(64),
          pdf_file_id INTEGER,
          score_at_generation INTEGER,
          scope_at_generation VARCHAR(32) NOT NULL,
          profile_version INTEGER NOT NULL,
          question_set_version INTEGER NOT NULL,
          generated_by INTEGER
            REFERENCES verifywise.users(id) ON DELETE SET NULL,
          generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
      `);

      await run(`
        CREATE UNIQUE INDEX bias_audit_stances_run_version_uq
          ON verifywise.bias_audit_stances (run_id, version);
      `);

      await run(`
        CREATE INDEX bias_audit_stances_org_project_idx
          ON verifywise.bias_audit_stances (organization_id, project_id);
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run("DROP TABLE IF EXISTS verifywise.bias_audit_stances;");
      await run("DROP TABLE IF EXISTS verifywise.bias_audit_runs;");
      await run("DROP TABLE IF EXISTS verifywise.aedt_profile_answers;");
      await run("DROP TABLE IF EXISTS verifywise.aedt_profiles;");
      await run("DROP TYPE IF EXISTS verifywise.enum_aedt_profiles_status;");
    });
  },
};
