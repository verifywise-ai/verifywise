'use strict';

/**
 * Seed Framework Struct Data Migration
 *
 * Seeds the verifywise schema struct tables with framework template data:
 * - EU AI Act: topics, subtopics, questions, control categories, controls, subcontrols
 * - ISO 42001: clauses, subclauses, annex categories
 * - ISO 27001: clauses, subclauses, annex categories, annex controls
 * - NIST AI RMF: categories, subcategories
 *
 * This data is shared across all organizations (no organization_id).
 * Each struct table references the frameworks table via framework_id.
 *
 * Data is loaded dynamically from compiled structure files in dist/structures/.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('Seeding framework struct data...');

      // ========================================
      // HELPER FUNCTIONS
      // ========================================

      /**
       * Insert a row and return the generated id.
       */
      const insertReturningId = async (sql, replacements) => {
        const [rows] = await queryInterface.sequelize.query(sql, { replacements, transaction });
        return rows[0] && rows[0].id;
      };

      /**
       * Format a JS array of strings as a PostgreSQL TEXT[] literal: {val1,val2,...}
       */
      const toPgArray = (arr) => {
        if (!arr || !Array.isArray(arr) || arr.length === 0) return '{}';
        const escaped = arr.map(v => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
        return `{${escaped.join(',')}}`;
      };

      // ========================================
      // SEED FRAMEWORKS TABLE
      // ========================================
      console.log('Seeding frameworks...');

      const frameworks = [
        { name: 'EU AI Act', description: 'European Union Artificial Intelligence Act' },
        { name: 'ISO 42001', description: 'ISO/IEC 42001 AI Management System' },
        { name: 'ISO 27001', description: 'ISO/IEC 27001 Information Security Management' },
        { name: 'NIST AI RMF', description: 'NIST AI Risk Management Framework' },
      ];

      for (const fw of frameworks) {
        const [existing] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.frameworks WHERE name = :name LIMIT 1`,
          { replacements: { name: fw.name }, transaction }
        );
        if (existing.length === 0) {
          await queryInterface.sequelize.query(`
            INSERT INTO verifywise.frameworks (name, description, is_active, is_demo)
            VALUES (:name, :description, true, false)
          `, { replacements: fw, transaction });
        }
      }

      // Get framework IDs
      const [fwRows] = await queryInterface.sequelize.query(
        `SELECT id, name FROM verifywise.frameworks WHERE name IN ('EU AI Act', 'ISO 42001', 'ISO 27001', 'NIST AI RMF')`,
        { transaction }
      );
      const fwIdMap = {};
      fwRows.forEach(row => { fwIdMap[row.name] = row.id; });

      const euFrameworkId = fwIdMap['EU AI Act'];
      const iso42001FrameworkId = fwIdMap['ISO 42001'];
      const iso27001FrameworkId = fwIdMap['ISO 27001'];
      const nistFrameworkId = fwIdMap['NIST AI RMF'];

      // ========================================
      // CLEAR EXISTING STRUCT DATA (reverse dependency order)
      // ========================================
      console.log('Clearing existing struct data...');
      await queryInterface.sequelize.query(`DELETE FROM verifywise.nist_ai_rmf_subcategories_struct;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.nist_ai_rmf_categories_struct;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annexcontrols_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annexcategories_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annex_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.subclauses_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.clauses_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annexcategories_struct_iso;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annex_struct_iso;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.subclauses_struct_iso;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.clauses_struct_iso;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.subcontrols_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.controls_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.controlcategories_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.questions_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.subtopics_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.topics_struct_eu;`, { transaction });

      // ========================================
      // EU AI ACT
      // ========================================
      if (!euFrameworkId) {
        console.log('EU AI Act framework not found - skipping...');
      } else {
        console.log('Seeding EU AI Act data...');

        const { Topics } = require('../../dist/structures/EU-AI-Act/assessment-tracker/topics.struct');
        const { ControlCategories } = require('../../dist/structures/EU-AI-Act/compliance-tracker/controlCategories.struct');

        // --- Topics, Subtopics, Questions ---
        for (const topic of Topics) {
          const topicId = await insertReturningId(`
            INSERT INTO verifywise.topics_struct_eu (framework_id, title, order_no, is_demo)
            VALUES (:frameworkId, :title, :order_no, false)
            ON CONFLICT DO NOTHING
            RETURNING id
          `, { frameworkId: euFrameworkId, title: topic.title, order_no: topic.order_no });

          if (!topicId || !topic.subtopics) continue;

          for (const subtopic of topic.subtopics) {
            const subtopicId = await insertReturningId(`
              INSERT INTO verifywise.subtopics_struct_eu (topic_id, title, order_no, is_demo)
              VALUES (:topicId, :title, :order_no, false)
              ON CONFLICT DO NOTHING
              RETURNING id
            `, { topicId, title: subtopic.title, order_no: subtopic.order_no });

            if (!subtopicId || !subtopic.questions) continue;

            for (const q of subtopic.questions) {
              await queryInterface.sequelize.query(`
                INSERT INTO verifywise.questions_struct_eu (subtopic_id, order_no, question, hint, priority_level, answer_type, input_type, evidence_required, is_required, is_demo)
                VALUES (:subtopicId, :order_no, :question, :hint, :priority_level, :answer_type, :input_type, :evidence_required, :is_required, false)
                ON CONFLICT DO NOTHING
              `, {
                replacements: {
                  subtopicId,
                  order_no: q.order_no,
                  question: q.question,
                  hint: q.hint || '',
                  priority_level: q.priority_level || 'medium priority',
                  answer_type: q.answer_type || 'Long text',
                  input_type: q.input_type || 'Tiptap area',
                  evidence_required: q.evidence_required || false,
                  is_required: q.isrequired !== undefined ? q.isrequired : (q.is_required !== undefined ? q.is_required : true),
                },
                transaction,
              });
            }
          }
        }

        // --- Control Categories, Controls, Subcontrols ---
        for (const category of ControlCategories) {
          const categoryId = await insertReturningId(`
            INSERT INTO verifywise.controlcategories_struct_eu (framework_id, title, order_no, is_demo)
            VALUES (:frameworkId, :title, :order_no, false)
            ON CONFLICT DO NOTHING
            RETURNING id
          `, { frameworkId: euFrameworkId, title: category.title, order_no: category.order_no });

          if (!categoryId || !category.controls) continue;

          for (const control of category.controls) {
            const controlId = await insertReturningId(`
              INSERT INTO verifywise.controls_struct_eu (control_category_id, title, description, order_no, is_demo)
              VALUES (:categoryId, :title, :description, :order_no, false)
              ON CONFLICT DO NOTHING
              RETURNING id
            `, {
              categoryId,
              title: control.title,
              description: control.description || '',
              order_no: control.order_no,
            });

            if (!controlId || !control.subControls) continue;

            for (const sc of control.subControls) {
              await queryInterface.sequelize.query(`
                INSERT INTO verifywise.subcontrols_struct_eu (control_id, title, description, order_no, is_demo)
                VALUES (:controlId, :title, :description, :order_no, false)
                ON CONFLICT DO NOTHING
              `, {
                replacements: {
                  controlId,
                  title: sc.title,
                  description: sc.description || '',
                  order_no: sc.order_no,
                },
                transaction,
              });
            }
          }
        }

        console.log('EU AI Act data seeded.');
      } // end EU AI Act

      // ========================================
      // ISO 42001
      // ========================================
      if (!iso42001FrameworkId) {
        console.log('ISO 42001 framework not found - skipping...');
      } else {
        console.log('Seeding ISO 42001 data...');

        const { Clauses } = require('../../dist/structures/ISO-42001/clauses/clauses.struct');
        const { Annex } = require('../../dist/structures/ISO-42001/annex/annex.struct');

        // --- Clauses & Subclauses ---
        for (const clause of Clauses) {
          const clauseId = await insertReturningId(`
            INSERT INTO verifywise.clauses_struct_iso(framework_id, clause_id, title, clause_no, order_no, is_demo)
            VALUES (:frameworkId, :clause_id, :title, :clause_no, :order_no, false)
            ON CONFLICT DO NOTHING
            RETURNING id
          `, {
            frameworkId: iso42001FrameworkId,
            clause_id: String(clause.clause_no),
            title: clause.title,
            clause_no: clause.clause_no,
            order_no: clause.clause_no,
          });

          if (!clauseId || !clause.subclauses) continue;

          for (const sub of clause.subclauses) {
            await queryInterface.sequelize.query(`
              INSERT INTO verifywise.subclauses_struct_iso(clause_id, subclause_id, title, summary, questions, evidence_examples, order_no, is_demo)
              VALUES (:clauseId, :subclause_id, :title, :summary, :questions, :evidence_examples, :order_no, false)
              ON CONFLICT DO NOTHING
            `, {
              replacements: {
                clauseId,
                subclause_id: `${clause.clause_no}.${sub.order_no}`,
                title: sub.title,
                summary: sub.summary || '',
                questions: toPgArray(sub.questions),
                evidence_examples: toPgArray(sub.evidence_examples),
                order_no: sub.order_no,
              },
              transaction,
            });
          }
        }

        // --- Annex & Annex Categories ---
        for (const annex of Annex) {
          const annexId = await insertReturningId(`
            INSERT INTO verifywise.annex_struct_iso(framework_id, title, annex_no, order_no, is_demo)
            VALUES (:frameworkId, :title, :annex_no, :order_no, false)
            ON CONFLICT DO NOTHING
            RETURNING id
          `, {
            frameworkId: iso42001FrameworkId,
            title: annex.title || `Annex ${annex.annex_no}`,
            annex_no: annex.annex_no,
            order_no: annex.annex_no,
          });

          if (!annexId || !annex.annexcategories) continue;

          for (const cat of annex.annexcategories) {
            await queryInterface.sequelize.query(`
              INSERT INTO verifywise.annexcategories_struct_iso(annex_id, sub_id, title, description, guidance, order_no, is_demo)
              VALUES (:annex_id, :sub_id, :title, :description, :guidance, :order_no, false)
              ON CONFLICT DO NOTHING
            `, {
              replacements: {
                annex_id: annexId,
                sub_id: cat.sub_id || cat.order_no,
                title: cat.title,
                description: cat.description || '',
                guidance: cat.guidance || '',
                order_no: cat.order_no,
              },
              transaction,
            });
          }
        }

        console.log('ISO 42001 data seeded.');
      } // end ISO 42001

      // ========================================
      // ISO 27001
      // ========================================
      if (!iso27001FrameworkId) {
        console.log('ISO 27001 framework not found - skipping...');
      } else {
        console.log('Seeding ISO 27001 data...');

        const { ISO27001Clause } = require('../../dist/structures/ISO-27001/clauses/iso27001.clause.struct');
        const { ISO27001Annex } = require('../../dist/structures/ISO-27001/annexes/iso27001.annex.struct');

        // --- Clauses & Subclauses ---
        for (const clause of ISO27001Clause) {
          const clauseId = await insertReturningId(`
            INSERT INTO verifywise.clauses_struct_iso27001 (framework_id, clause_id, title, order_no, is_demo)
            VALUES (:frameworkId, :clause_id, :title, :order_no, false)
            ON CONFLICT DO NOTHING
            RETURNING id
          `, {
            frameworkId: iso27001FrameworkId,
            clause_id: String(clause.arrangement),
            title: clause.title,
            order_no: clause.arrangement,
          });

          if (!clauseId || !clause.subclauses) continue;

          for (const sub of clause.subclauses) {
            await queryInterface.sequelize.query(`
              INSERT INTO verifywise.subclauses_struct_iso27001 (clause_id, subclause_id, title, requirement_summary, key_questions, evidence_examples, order_no, is_demo)
              VALUES (:clauseId, :subclause_id, :title, :requirement_summary, :key_questions, :evidence_examples, :order_no, false)
              ON CONFLICT DO NOTHING
            `, {
              replacements: {
                clauseId,
                subclause_id: `${clause.arrangement}.${sub.index}`,
                title: sub.title,
                requirement_summary: sub.requirement_summary || '',
                key_questions: toPgArray(sub.key_questions),
                evidence_examples: toPgArray(sub.evidence_examples),
                order_no: sub.index,
              },
              transaction,
            });
          }
        }

        // --- Annex Struct, Categories & Controls ---
        for (const annex of ISO27001Annex) {
          // Insert parent annex struct entry
          const annexStructId = await insertReturningId(`
            INSERT INTO verifywise.annex_struct_iso27001 (framework_id, arrangement, title, order_no, is_demo)
            VALUES (:frameworkId, :arrangement, :title, :order_no, false)
            ON CONFLICT DO NOTHING
            RETURNING id
          `, {
            frameworkId: iso27001FrameworkId,
            arrangement: annex.arrangement,
            title: annex.category_name,
            order_no: annex.index,
          });

          // Insert annex category
          const annexCategoryId = await insertReturningId(`
            INSERT INTO verifywise.annexcategories_struct_iso27001 (framework_id, annex_id, title, order_no, is_demo)
            VALUES (:frameworkId, :annex_id, :title, :order_no, false)
            ON CONFLICT DO NOTHING
            RETURNING id
          `, {
            frameworkId: iso27001FrameworkId,
            annex_id: `A.${annex.index}`,
            title: annex.category_name,
            order_no: annex.index,
          });

          if (!annexCategoryId || !annex.controls) continue;

          for (const ctrl of annex.controls) {
            await queryInterface.sequelize.query(`
              INSERT INTO verifywise.annexcontrols_struct_iso27001 (category_id, annex_id, control_id, title, order_no, requirement_summary, key_questions, evidence_examples, is_demo)
              VALUES (:annexCategoryId, :annexStructId, :control_id, :title, :order_no, :requirement_summary, :key_questions, :evidence_examples, false)
              ON CONFLICT DO NOTHING
            `, {
              replacements: {
                annexCategoryId,
                annexStructId: annexStructId || null,
                control_id: `A.${annex.index}.${ctrl.index}`,
                title: ctrl.title,
                order_no: ctrl.index,
                requirement_summary: ctrl.requirement_summary || '',
                key_questions: toPgArray(ctrl.key_questions),
                evidence_examples: toPgArray(ctrl.evidence_examples),
              },
              transaction,
            });
          }
        }

        console.log('ISO 27001 data seeded.');
      } // end ISO 27001

      // ========================================
      // NIST AI RMF
      // ========================================
      if (!nistFrameworkId) {
        console.log('NIST AI RMF framework not found - skipping...');
      } else {
        console.log('Seeding NIST AI RMF data...');

        const { NIST_AI_RMF_Structure } = require('../../dist/structures/NIST-AI-RMF/nist-ai-rmf.structure');

        for (const func of NIST_AI_RMF_Structure.functions) {
          if (!func.categories) continue;

          for (const category of func.categories) {
            const categoryStructId = await insertReturningId(`
              INSERT INTO verifywise.nist_ai_rmf_categories_struct (framework_id, function, category_id, description, order_no, is_demo)
              VALUES (:frameworkId, :function, :category_id, :description, :order_no, false)
              ON CONFLICT (function, category_id) DO NOTHING
              RETURNING id
            `, {
              frameworkId: nistFrameworkId,
              function: func.type,
              category_id: category.index,
              description: category.description || '',
              order_no: category.index,
            });

            if (!categoryStructId || !category.subcategories) continue;

            for (const sub of category.subcategories) {
              await queryInterface.sequelize.query(`
                INSERT INTO verifywise.nist_ai_rmf_subcategories_struct (category_struct_id, function, subcategory_id, description, order_no, is_demo)
                VALUES (:categoryStructId, :function, :subcategory_id, :description, :order_no, false)
                ON CONFLICT (function, subcategory_id) DO NOTHING
              `, {
                replacements: {
                  categoryStructId,
                  function: func.type,
                  subcategory_id: `${category.index}.${sub.index}`,
                  description: sub.description || '',
                  order_no: sub.index,
                },
                transaction,
              });
            }
          }
        }

        console.log('NIST AI RMF data seeded.');
      } // end NIST

      await transaction.commit();
      console.log('Framework struct data seeded successfully!');

    } catch (error) {
      await transaction.rollback();
      console.error('Seeding failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      console.log('Rolling back framework struct data...');

      // Delete data in reverse dependency order
      await queryInterface.sequelize.query(`DELETE FROM verifywise.nist_ai_rmf_subcategories_struct;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.nist_ai_rmf_categories_struct;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annexcontrols_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annexcategories_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annex_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.subclauses_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.clauses_struct_iso27001;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annexcategories_struct_iso;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.annex_struct_iso;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.subclauses_struct_iso;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.clauses_struct_iso;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.subcontrols_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.controls_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.controlcategories_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.questions_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.subtopics_struct_eu;`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM verifywise.topics_struct_eu;`, { transaction });

      await transaction.commit();
      console.log('Rollback completed successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Rollback failed:', error);
      throw error;
    }
  }
};
