'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Create the missing annex_struct_iso27001 table
      await queryInterface.sequelize.query(`
        CREATE TABLE IF NOT EXISTS verifywise.annex_struct_iso27001 (
          id SERIAL PRIMARY KEY,
          framework_id INTEGER NOT NULL REFERENCES verifywise.frameworks(id) ON DELETE CASCADE,
          arrangement VARCHAR(50) NOT NULL,
          title TEXT NOT NULL,
          order_no INTEGER NOT NULL,
          is_demo BOOLEAN DEFAULT false
        );
      `, { transaction });

      // 2. Seed data from the ISO 27001 annex structure (4 annex groups: A.5–A.8)
      const [frameworks] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks WHERE name = 'ISO 27001' LIMIT 1;`,
        { transaction }
      );

      if (frameworks.length > 0) {
        const frameworkId = frameworks[0].id;

        const annexEntries = [
          { arrangement: 'A', title: 'Organizational controls', order_no: 5 },
          { arrangement: 'A', title: 'People controls', order_no: 6 },
          { arrangement: 'A', title: 'Physical controls', order_no: 7 },
          { arrangement: 'A', title: 'Technological controls', order_no: 8 },
        ];

        for (const entry of annexEntries) {
          const [inserted] = await queryInterface.sequelize.query(`
            INSERT INTO verifywise.annex_struct_iso27001 (framework_id, arrangement, title, order_no, is_demo)
            VALUES (:frameworkId, :arrangement, :title, :order_no, false)
            ON CONFLICT DO NOTHING
            RETURNING id;
          `, {
            replacements: {
              frameworkId,
              arrangement: entry.arrangement,
              title: entry.title,
              order_no: entry.order_no,
            },
            transaction,
          });

          // 3. Update annexcontrols_struct_iso27001.annex_id to reference the new annex rows
          if (inserted.length > 0) {
            const annexId = inserted[0].id;
            // Find the matching annexcategories_struct_iso27001 row by annex_id pattern (e.g., "A.5")
            const annexIdPattern = `${entry.arrangement}.${entry.order_no}`;

            await queryInterface.sequelize.query(`
              UPDATE verifywise.annexcontrols_struct_iso27001
              SET annex_id = :annexId
              FROM verifywise.annexcategories_struct_iso27001 ac
              WHERE verifywise.annexcontrols_struct_iso27001.category_id = ac.id
                AND ac.annex_id = :annexIdPattern;
            `, {
              replacements: { annexId, annexIdPattern },
              transaction,
            });
          }
        }

        console.log('annex_struct_iso27001 table created and seeded successfully.');
      } else {
        console.log('ISO 27001 framework not found - table created but not seeded.');
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS verifywise.annex_struct_iso27001;
    `);
  }
};
