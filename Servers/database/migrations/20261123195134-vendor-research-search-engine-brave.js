"use strict";

/**
 * Vendor research: a run can search with Brave Search on the organization's own key (see
 * services/vendorResearch/searchEngineOf.ts), so `vendor_research_runs.search_engine` allows
 * `brave` beside `anthropic`, `openai` and `gdelt`.
 *
 * Up replaces the CHECK constraint. Down puts the old one back; a run that recorded `brave` would
 * break it, so down first sets those runs to no engine, which is what a run from before the column
 * shows.
 */

const BEFORE = ["anthropic", "openai", "gdelt"];
const AFTER = [...BEFORE, "brave"];

const list = (values) => values.map((value) => `'${value}'`).join(", ");

const replaceCheck = (engines) => `
  ALTER TABLE verifywise.vendor_research_runs
    DROP CONSTRAINT IF EXISTS vendor_research_runs_search_engine_check;
  ALTER TABLE verifywise.vendor_research_runs
    ADD CONSTRAINT vendor_research_runs_search_engine_check
    CHECK (search_engine IN (${list(engines)}));
`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(replaceCheck(AFTER), { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `UPDATE verifywise.vendor_research_runs SET search_engine = NULL WHERE search_engine = 'brave';`,
        { transaction },
      );
      await queryInterface.sequelize.query(replaceCheck(BEFORE), { transaction });
    });
  },
};
