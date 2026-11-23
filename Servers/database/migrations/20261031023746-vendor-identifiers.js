"use strict";

// A vendor can give its identifiers (spec Q1 of the vendor risk database): the country it is
// registered in (ISO 3166-1 alpha-2), its company registration number, its LEI (ISO 17442) and its
// SEC CIK (ten digits). A list that carries the same identifier then matches the vendor strongly,
// not by its name alone. The application checks and normalises them; the checks here keep a row
// from holding a form the matching cannot read. A vendor from before the columns has none.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendors
        ADD COLUMN IF NOT EXISTS country CHAR(2),
        ADD COLUMN IF NOT EXISTS registration_number VARCHAR(64),
        ADD COLUMN IF NOT EXISTS lei CHAR(20),
        ADD COLUMN IF NOT EXISTS sec_cik CHAR(10);
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendors
        DROP CONSTRAINT IF EXISTS vendors_country_check,
        DROP CONSTRAINT IF EXISTS vendors_lei_check,
        DROP CONSTRAINT IF EXISTS vendors_sec_cik_check;
      ALTER TABLE verifywise.vendors
        ADD CONSTRAINT vendors_country_check CHECK (country ~ '^[A-Z]{2}$'),
        ADD CONSTRAINT vendors_lei_check CHECK (lei ~ '^[A-Z0-9]{18}[0-9]{2}$'),
        ADD CONSTRAINT vendors_sec_cik_check CHECK (sec_cik ~ '^[0-9]{10}$');
    `);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE verifywise.vendors
        DROP CONSTRAINT IF EXISTS vendors_country_check,
        DROP CONSTRAINT IF EXISTS vendors_lei_check,
        DROP CONSTRAINT IF EXISTS vendors_sec_cik_check,
        DROP COLUMN IF EXISTS country,
        DROP COLUMN IF EXISTS registration_number,
        DROP COLUMN IF EXISTS lei,
        DROP COLUMN IF EXISTS sec_cik;
    `);
  },
};
