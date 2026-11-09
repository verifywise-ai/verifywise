"use strict";

/**
 * Generated corpora for the LL 144 bias module, and their append-only record log.
 *
 *  - bias_audit_corpora is one generation request. The plan (which candidate
 *    gets which sex, race/ethnicity and qualification tier) is not stored: it
 *    is re-derived from seed, planned_count and the fixed job description, so
 *    it is identical on every resume. job_description_sha256 pins the text the
 *    corpus was built from, so a resume after the text changed is refused.
 *    requested_count is what was asked for; planned_count is what the balanced
 *    allocation achieved (a multiple of 14 cells x tiers, so it can sit below
 *    the request). A partial unique index allows one running corpus per project.
 *
 *  - bias_audit_corpus_records is the log. Every attempt at every record is a
 *    new row and nothing updates or deletes one. The manifest is rebuilt from
 *    the whole log, never from the records of the current pass.
 *
 *  - One runner owns a corpus at a time, through a lease: owner_token and
 *    lease_expires_at. A runner claims only an unowned or expired lease, and
 *    its heartbeat, appends and completion all name its token, so a
 *    redelivered job or a manual retry cannot write beside a live runner.
 *
 *  - profile_id is NO ACTION, as on bias_audit_runs: a project delete cascades
 *    to both corpora and profiles, and NO ACTION is checked at statement end.
 *
 *  - bias_audit_runs.corpus_id gains its foreign key here, ON DELETE SET NULL,
 *    so a run scored from a corpus outlives the corpus.
 *
 * Corpora are synthetic and hold no applicant data; they are retained
 * indefinitely, outside the retention subsystem (data-retention.md).
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await run(`
        CREATE TABLE verifywise.bias_audit_corpora (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          project_id INTEGER NOT NULL
            REFERENCES verifywise.projects(id) ON DELETE CASCADE,
          profile_id INTEGER NOT NULL
            REFERENCES verifywise.aedt_profiles(id) ON DELETE NO ACTION,
          profile_version INTEGER NOT NULL,
          job_description_key VARCHAR(32) NOT NULL
            CHECK (job_description_key IN ('commercial-ae', 'operational-hourly')),
          job_description_sha256 CHAR(64) NOT NULL,
          artifact_kind VARCHAR(16) NOT NULL
            CHECK (artifact_kind IN ('resume', 'transcript', 'structured')),
          knockout VARCHAR(16) NOT NULL
            CHECK (knockout IN ('yes', 'no', 'dont_know')),
          requested_count INTEGER NOT NULL
            CHECK (requested_count BETWEEN 700 AND 10000),
          planned_count INTEGER NOT NULL,
          record_count INTEGER,
          seed INTEGER NOT NULL CHECK (seed >= 0),
          model_pinned TEXT NOT NULL,
          name_method TEXT NOT NULL,
          criteria_supplied TEXT,
          criteria_comparison_json JSONB NOT NULL,
          models_observed_json JSONB,
          cell_sizes_json JSONB,
          id_order_check_json JSONB,
          release_findings_json JSONB,
          manifest_json JSONB,
          manifest_sha256 CHAR(64),
          corpus_sha256 CHAR(64),
          status VARCHAR(16) NOT NULL DEFAULT 'running'
            CHECK (status IN ('running', 'complete', 'blocked', 'failed')),
          failure_code VARCHAR(64),
          heartbeat_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          owner_token VARCHAR(64),
          lease_expires_at TIMESTAMP WITH TIME ZONE,
          generated_by INTEGER
            REFERENCES verifywise.users(id) ON DELETE SET NULL,
          generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMP WITH TIME ZONE,
          CHECK (planned_count BETWEEN 700 AND requested_count)
        );
      `);

      // One running corpus per project.
      await run(`
        CREATE UNIQUE INDEX bias_audit_corpora_one_running_uq
          ON verifywise.bias_audit_corpora (project_id)
          WHERE status = 'running';
      `);

      await run(`
        CREATE INDEX bias_audit_corpora_org_project_idx
          ON verifywise.bias_audit_corpora (organization_id, project_id);
      `);

      await run(`
        CREATE TABLE verifywise.bias_audit_corpus_records (
          id BIGSERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL
            REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
          corpus_id INTEGER NOT NULL
            REFERENCES verifywise.bias_audit_corpora(id) ON DELETE CASCADE,
          candidate_id VARCHAR(16) NOT NULL,
          attempt SMALLINT NOT NULL CHECK (attempt >= 1),
          text TEXT NOT NULL,
          model_name TEXT NOT NULL,
          prompt_hash CHAR(64) NOT NULL,
          validation_status VARCHAR(8) NOT NULL
            CHECK (validation_status IN ('valid', 'invalid')),
          invalid_reason VARCHAR(32),
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          CONSTRAINT bias_audit_corpus_records_attempt_uq
            UNIQUE (corpus_id, candidate_id, attempt)
        );
      `);

      await run(`
        ALTER TABLE verifywise.bias_audit_runs
          ADD CONSTRAINT bias_audit_runs_corpus_id_fkey
          FOREIGN KEY (corpus_id) REFERENCES verifywise.bias_audit_corpora(id)
          ON DELETE SET NULL;
      `);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const run = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await run(`
        ALTER TABLE verifywise.bias_audit_runs
          DROP CONSTRAINT IF EXISTS bias_audit_runs_corpus_id_fkey;
      `);
      await run("DROP TABLE IF EXISTS verifywise.bias_audit_corpus_records;");
      await run("DROP TABLE IF EXISTS verifywise.bias_audit_corpora;");
    });
  },
};
