"use strict";

/**
 * Vendor research: the search a run used (Q21). A run searches with the web search of its key's
 * provider or, when the key has none, with the news of the GDELT Project (see
 * services/vendorResearch/searchEngineOf.ts), and a run of an Anthropic key whose search is refused
 * finishes on the news. The run keeps the one its searches went to, so that the run summary can
 * say which search it was and credit the GDELT Project, whose terms ask for a link.
 *
 * `search_engine` is new and nullable: a run from before the column, a run that searched nothing and
 * a run that has not ended have none. `openai` is allowed for an engine that is not built yet; no
 * run stores it today.
 *
 * Down drops the column, and the constraint with it.
 */

const ENGINES = ["anthropic", "openai", "gdelt"];

const list = (values) => values.map((value) => `'${value}'`).join(", ");

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendor_research_runs
        ADD COLUMN IF NOT EXISTS search_engine VARCHAR(16)
          CONSTRAINT vendor_research_runs_search_engine_check
          CHECK (search_engine IN (${list(ENGINES)}));
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendor_research_runs
        DROP COLUMN IF EXISTS search_engine;
    `);
  },
};
