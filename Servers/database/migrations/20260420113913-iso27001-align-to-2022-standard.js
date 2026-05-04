"use strict";

const toPgArray = (arr) => {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "{}";
  const escaped = arr.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
};

/**
 * ISO 27001 — bring VW's struct tables in line with ISO/IEC 27001:2022
 * Annex A and Clause 6.
 *
 * Source of truth: ISO/IEC 27001:2022 published standard (not the developer
 * brief; the brief has internal contradictions for Annex A.8 where multiple
 * entries map to "Use of cryptography" — resolved here by using the standard).
 *
 * Changes applied in one transaction:
 *
 *   CLAUSE 6
 *     • Rename the two existing rows tagged subclause_id='6.1' to '6.1.2'
 *       (Information security risk assessment) and '6.1.3' (Information
 *       security risk treatment). Preserves tenant answers via UPDATE.
 *     • INSERT new 6.1.1 "General" and 6.3 "Planning of changes" subclauses.
 *     • INSERT an empty tenant row per ISO 27001 projects_frameworks for each
 *       new subclause.
 *
 *   ANNEX A.5 (Organizational controls)
 *     • Minor wording on A.5.9, A.5.10 (add "other associated").
 *     • Rename A.5.14 through A.5.36 (23 controls) to 2022 titles.
 *     • INSERT A.5.37 "Documented operating procedures" + empty tenant rows.
 *
 *   ANNEX A.6 (People controls)
 *     • Rename A.6.5, A.6.6, A.6.7, A.6.8 to 2022 order/titles.
 *
 *   ANNEX A.7 (Physical controls)
 *     • Rename A.7.4 through A.7.14 to 2022 titles (A.7.8 unchanged).
 *
 *   ANNEX A.8 (Technological controls)
 *     • Rename A.8.3 through A.8.31 to 2022 titles (A.8.1, A.8.2 unchanged).
 *     • DELETE phantom A.8.32-A.8.35 "Network service security …" controls.
 *       Tenant answers on these phantom rows cascade — acceptable, they were
 *       never part of the 2022 standard.
 *     • INSERT real 2022 A.8.32 "Change management", A.8.33 "Test information",
 *       A.8.34 "Protection of information systems during audit testing" with
 *       empty tenant rows per project.
 *
 * All UPDATE / INSERT / DELETE operations run in one transaction. Idempotent
 * via NOT EXISTS guards on tenant-row INSERTs.
 */

// Old title → new 2022 title. Uses old titles as UPDATE target to avoid
// depending on control_id character values.
const ANNEX_RENAMES = [
  // A.5 wording
  {
    annex: 5,
    oldTitle: "Inventory of information and assets",
    newTitle: "Inventory of information and other associated assets",
  },
  {
    annex: 5,
    oldTitle: "Acceptable use of information and assets",
    newTitle: "Acceptable use of information and other associated assets",
  },
  // A.5.14 – A.5.36 renumber to 2022 titles
  { annex: 5, oldTitle: "Handling of information", newTitle: "Information transfer" },
  { annex: 5, oldTitle: "Access control policy", newTitle: "Access control" },
  {
    annex: 5,
    oldTitle: "Access to networks and network services",
    newTitle: "Identity management",
  },
  {
    annex: 5,
    oldTitle: "User registration and de-registration",
    newTitle: "Authentication information",
  },
  { annex: 5, oldTitle: "Management of privileged access rights", newTitle: "Access rights" },
  {
    annex: 5,
    oldTitle: "Management of secret authentication information",
    newTitle: "Information security in supplier relationships",
  },
  {
    annex: 5,
    oldTitle: "Review of user access rights",
    newTitle: "Addressing information security within supplier agreements",
  },
  {
    annex: 5,
    oldTitle: "Removal or adjustment of access rights",
    newTitle: "Managing information security in the ICT supply chain",
  },
  {
    annex: 5,
    oldTitle: "Use of secret authentication information",
    newTitle: "Monitoring, review and change management of supplier services",
  },
  {
    annex: 5,
    oldTitle: "Information security in supplier relationships",
    newTitle: "Information security for use of cloud services",
  },
  {
    annex: 5,
    oldTitle: "Addressing information security within supplier agreements",
    newTitle: "Information security incident management planning and preparation",
  },
  {
    annex: 5,
    oldTitle: "Information and communication technology supply chain security",
    newTitle: "Assessment and decision on information security events",
  },
  {
    annex: 5,
    oldTitle: "Monitoring, review, and change management of supplier services",
    newTitle: "Response to information security incidents",
  },
  {
    annex: 5,
    oldTitle: "Incident management responsibilities and procedures",
    newTitle: "Learning from information security incidents",
  },
  {
    annex: 5,
    oldTitle: "Reporting information security events",
    newTitle: "Collection of evidence",
  },
  {
    annex: 5,
    oldTitle: "Reporting information security weaknesses",
    newTitle: "Information security during disruption",
  },
  {
    annex: 5,
    oldTitle: "Assessment and decision on information security events",
    newTitle: "ICT readiness for business continuity",
  },
  {
    annex: 5,
    oldTitle: "Response to information security incidents",
    newTitle: "Legal, statutory, regulatory and contractual requirements",
  },
  {
    annex: 5,
    oldTitle: "Learning from information security incidents",
    newTitle: "Intellectual property rights",
  },
  { annex: 5, oldTitle: "Collection of evidence", newTitle: "Protection of records" },
  {
    annex: 5,
    oldTitle: "Business continuity planning for information security",
    newTitle: "Privacy and protection of personal information",
  },
  {
    annex: 5,
    oldTitle: "Redundancy of information processing facilities",
    newTitle: "Independent review of information security",
  },
  {
    annex: 5,
    oldTitle: "Documented operating procedures",
    newTitle: "Compliance with policies, rules and standards",
  },

  // A.6 reorder
  {
    annex: 6,
    oldTitle: "Confidentiality or non-disclosure agreements",
    newTitle: "Responsibilities after termination or change of employment",
  },
  {
    annex: 6,
    oldTitle: "Remote working",
    newTitle: "Confidentiality or non-disclosure agreements",
  },
  {
    annex: 6,
    oldTitle: "Termination or change of employment responsibilities",
    newTitle: "Remote working",
  },
  { annex: 6, oldTitle: "User responsibilities", newTitle: "Information security event reporting" },

  // A.7 reorder
  {
    annex: 7,
    oldTitle: "Protecting against physical and environmental threats",
    newTitle: "Physical security monitoring",
  },
  {
    annex: 7,
    oldTitle: "Working in secure areas",
    newTitle: "Protecting against physical and environmental threats",
  },
  { annex: 7, oldTitle: "Visitor access records", newTitle: "Working in secure areas" },
  { annex: 7, oldTitle: "Delivery and loading areas", newTitle: "Clear desk and clear screen" },
  // A.7.8 Equipment siting and protection — unchanged
  { annex: 7, oldTitle: "Supporting utilities", newTitle: "Security of assets off-premises" },
  { annex: 7, oldTitle: "Cabling security", newTitle: "Storage media" },
  { annex: 7, oldTitle: "Equipment maintenance", newTitle: "Supporting utilities" },
  { annex: 7, oldTitle: "Secure disposal or re-use of equipment", newTitle: "Cabling security" },
  { annex: 7, oldTitle: "Removal of assets", newTitle: "Equipment maintenance" },
  {
    annex: 7,
    oldTitle: "Clear desk and clear screen policy",
    newTitle: "Secure disposal or re-use of equipment",
  },

  // A.8 rebuild to 2022 titles (A.8.1, A.8.2 unchanged)
  { annex: 8, oldTitle: "Access to source code", newTitle: "Information access restriction" },
  { annex: 8, oldTitle: "Change management", newTitle: "Access to source code" },
  { annex: 8, oldTitle: "Capacity management", newTitle: "Secure authentication" },
  {
    annex: 8,
    oldTitle: "Development, testing and operational environments",
    newTitle: "Capacity management",
  },
  { annex: 8, oldTitle: "Protection of test data", newTitle: "Protection against malware" },
  {
    annex: 8,
    oldTitle: "Logging and monitoring",
    newTitle: "Management of technical vulnerabilities",
  },
  { annex: 8, oldTitle: "Clock synchronization", newTitle: "Configuration management" },
  { annex: 8, oldTitle: "Protection of log information", newTitle: "Information deletion" },
  { annex: 8, oldTitle: "Administrator and operator logs", newTitle: "Data masking" },
  { annex: 8, oldTitle: "Fault logging", newTitle: "Data leakage prevention" },
  { annex: 8, oldTitle: "Cryptographic controls policy", newTitle: "Information backup" },
  {
    annex: 8,
    oldTitle: "Key management",
    newTitle: "Redundancy of information processing facilities",
  },
  { annex: 8, oldTitle: "Network controls", newTitle: "Logging" },
  { annex: 8, oldTitle: "Security of network services", newTitle: "Monitoring activities" },
  { annex: 8, oldTitle: "Segregation of networks", newTitle: "Clock synchronization" },
  { annex: 8, oldTitle: "Use of network services", newTitle: "Use of privileged utility programs" },
  {
    annex: 8,
    oldTitle: "Web filtering",
    newTitle: "Installation of software on operational systems",
  },
  { annex: 8, oldTitle: "Cryptographic key usage", newTitle: "Networks security" },
  { annex: 8, oldTitle: "Backup", newTitle: "Security of network services" },
  {
    annex: 8,
    oldTitle: "Information transfer policies and procedures",
    newTitle: "Segregation of networks",
  },
  { annex: 8, oldTitle: "Electronic messaging", newTitle: "Web filtering" },
  {
    annex: 8,
    oldTitle: "Confidentiality of information in networks",
    newTitle: "Use of cryptography",
  },
  { annex: 8, oldTitle: "Security of system files", newTitle: "Secure development life cycle" },
  { annex: 8, oldTitle: "Malware protection", newTitle: "Application security requirements" },
  {
    annex: 8,
    oldTitle: "Technical vulnerability management",
    newTitle: "Secure system architecture and engineering principles",
  },
  { annex: 8, oldTitle: "Configuration management", newTitle: "Secure coding" },
  {
    annex: 8,
    oldTitle: "Monitoring of system use",
    newTitle: "Security testing in development and acceptance",
  },
  { annex: 8, oldTitle: "Protection of application services", newTitle: "Outsourced development" },
  {
    annex: 8,
    oldTitle: "Data masking",
    newTitle: "Separation of development, test and production environments",
  },
];

const PHANTOM_A8_TITLES = [
  "Network service security audit",
  "Network service security compliance",
  "Network service security reporting",
  "Network service security improvement",
];

// New A.5.37 and correct A.8.32-34 (2022 standard). control_id value for new
// rows is computed at insert time to match the existing VW convention:
//   A.{annex.index}.{ctrl.index}  — e.g. "A.5.37", "A.8.32"
const NEW_ANNEX_CONTROLS = [
  {
    annex: 5,
    control_id: "A.5.37",
    order_no: 37,
    title: "Documented operating procedures",
    requirement_summary:
      "Document operating procedures for information processing facilities and make them available to personnel who need them.",
  },
  {
    annex: 8,
    control_id: "A.8.32",
    order_no: 32,
    title: "Change management",
    requirement_summary:
      "Control changes to information processing facilities through formal procedures including submission, assessment, authorization, implementation, and review.",
  },
  {
    annex: 8,
    control_id: "A.8.33",
    order_no: 33,
    title: "Test information",
    requirement_summary:
      "Select, protect, and manage test information. Avoid production data with personal/sensitive content; apply masking or anonymization when production data must be used.",
  },
  {
    annex: 8,
    control_id: "A.8.34",
    order_no: 34,
    title: "Protection of information systems during audit testing",
    requirement_summary:
      "Plan and coordinate audit tests to minimize business disruption. Restrict scope and schedule tests outside business hours where possible.",
  },
];

const NEW_SUBCLAUSES = [
  {
    clauseNo: 6,
    subclause_id: "6.1.1",
    order_no: 1,
    title: "General — actions to address risks and opportunities",
    requirement_summary:
      "When planning for the ISMS, consider the issues from 4.1 and requirements from 4.2 to determine risks and opportunities that need to be addressed to ensure the ISMS achieves its intended outcomes.",
  },
  {
    clauseNo: 6,
    subclause_id: "6.3",
    order_no: 5,
    title: "Planning of changes",
    requirement_summary:
      "When the organization determines the need for changes to the ISMS, the changes shall be carried out in a planned manner.",
  },
];

module.exports = {
  async up(queryInterface) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const [[framework]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.frameworks WHERE name = 'ISO 27001' LIMIT 1;`,
        { transaction: t },
      );
      if (!framework) {
        console.warn("[iso27001-2022] framework not found — skipping");
        await t.commit();
        return;
      }
      const frameworkId = framework.id;

      // ----- CLAUSE 6: rename two '6.1' rows to '6.1.2' / '6.1.3', add 6.1.1 + 6.3
      const [[clause6]] = await queryInterface.sequelize.query(
        `SELECT id FROM verifywise.clauses_struct_iso27001
         WHERE framework_id = :frameworkId AND clause_id = '6' LIMIT 1;`,
        { transaction: t, replacements: { frameworkId } },
      );
      if (clause6?.id) {
        await queryInterface.sequelize.query(
          `UPDATE verifywise.subclauses_struct_iso27001
             SET subclause_id = '6.1.2', order_no = 2
           WHERE clause_id = :clauseId AND title = 'Information security risk assessment';`,
          { transaction: t, replacements: { clauseId: clause6.id } },
        );
        await queryInterface.sequelize.query(
          `UPDATE verifywise.subclauses_struct_iso27001
             SET subclause_id = '6.1.3', order_no = 3
           WHERE clause_id = :clauseId AND title = 'Information security risk treatment';`,
          { transaction: t, replacements: { clauseId: clause6.id } },
        );

        // Final ordering under clause 6: 6.1.1 (1), 6.1.2 (2), 6.1.3 (3),
        // 6.2 (4), 6.3 (5). Bump 6.2 from its current order_no to 4.
        await queryInterface.sequelize.query(
          `UPDATE verifywise.subclauses_struct_iso27001
             SET order_no = 4
           WHERE clause_id = :clauseId AND subclause_id = '6.2';`,
          { transaction: t, replacements: { clauseId: clause6.id } },
        );

        for (const sub of NEW_SUBCLAUSES) {
          const [[existing]] = await queryInterface.sequelize.query(
            `SELECT id FROM verifywise.subclauses_struct_iso27001
             WHERE clause_id = :clauseId AND subclause_id = :subclause_id LIMIT 1;`,
            {
              transaction: t,
              replacements: { clauseId: clause6.id, subclause_id: sub.subclause_id },
            },
          );
          let structId = existing?.id;
          if (!structId) {
            const [[inserted]] = await queryInterface.sequelize.query(
              `INSERT INTO verifywise.subclauses_struct_iso27001
                 (clause_id, subclause_id, title, requirement_summary, order_no, is_demo)
               VALUES (:clauseId, :subclause_id, :title, :requirement_summary, :order_no, false)
               RETURNING id;`,
              {
                transaction: t,
                replacements: {
                  clauseId: clause6.id,
                  subclause_id: sub.subclause_id,
                  title: sub.title,
                  requirement_summary: sub.requirement_summary,
                  order_no: sub.order_no,
                },
              },
            );
            structId = inserted.id;
          }

          await queryInterface.sequelize.query(
            `INSERT INTO verifywise.subclauses_iso27001
               (organization_id, projects_frameworks_id, subclause_meta_id, status)
             SELECT pf.organization_id, pf.id, :structId, 'Not started'
             FROM verifywise.projects_frameworks pf
             WHERE pf.framework_id = :frameworkId
               AND NOT EXISTS (
                 SELECT 1 FROM verifywise.subclauses_iso27001 si
                 WHERE si.projects_frameworks_id = pf.id AND si.subclause_meta_id = :structId
               );`,
            { transaction: t, replacements: { structId, frameworkId } },
          );
        }
      }

      // ----- ANNEX RENAMES (two-phase with placeholder tokens to avoid
      //       cascade collisions where a rename's NEW title matches another
      //       rename's OLD title).
      // Phase 1: old title → unique placeholder
      for (let i = 0; i < ANNEX_RENAMES.length; i++) {
        const r = ANNEX_RENAMES[i];
        await queryInterface.sequelize.query(
          `UPDATE verifywise.annexcontrols_struct_iso27001
             SET title = :placeholder
           WHERE title = :oldTitle
             AND category_id IN (
               SELECT id FROM verifywise.annexcategories_struct_iso27001
               WHERE framework_id = :frameworkId AND annex_id = :annexId
             );`,
          {
            transaction: t,
            replacements: {
              frameworkId,
              annexId: `A.${r.annex}`,
              oldTitle: r.oldTitle,
              placeholder: `__ISO27001_RENAME_${i}__`,
            },
          },
        );
      }
      // Phase 2: placeholder → final new title
      for (let i = 0; i < ANNEX_RENAMES.length; i++) {
        const r = ANNEX_RENAMES[i];
        await queryInterface.sequelize.query(
          `UPDATE verifywise.annexcontrols_struct_iso27001
             SET title = :newTitle
           WHERE title = :placeholder
             AND category_id IN (
               SELECT id FROM verifywise.annexcategories_struct_iso27001
               WHERE framework_id = :frameworkId AND annex_id = :annexId
             );`,
          {
            transaction: t,
            replacements: {
              frameworkId,
              annexId: `A.${r.annex}`,
              newTitle: r.newTitle,
              placeholder: `__ISO27001_RENAME_${i}__`,
            },
          },
        );
      }

      // ----- DELETE phantom A.8.32-A.8.35
      // Use toPgArray to build a literal text[] value, since passing a JS array
      // directly through :replacements gets expanded as positional parameters.
      await queryInterface.sequelize.query(
        `DELETE FROM verifywise.annexcontrols_struct_iso27001
         WHERE title = ANY(:phantoms::text[])
           AND category_id IN (
             SELECT id FROM verifywise.annexcategories_struct_iso27001
             WHERE framework_id = :frameworkId AND annex_id = 'A.8'
           );`,
        { transaction: t, replacements: { frameworkId, phantoms: toPgArray(PHANTOM_A8_TITLES) } },
      );

      // ----- INSERT new annex controls (A.5.37, A.8.32, A.8.33, A.8.34)
      for (const ctrl of NEW_ANNEX_CONTROLS) {
        const [[category]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.annexcategories_struct_iso27001
           WHERE framework_id = :frameworkId AND annex_id = :annexId LIMIT 1;`,
          { transaction: t, replacements: { frameworkId, annexId: `A.${ctrl.annex}` } },
        );
        const [[annexStruct]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.annex_struct_iso27001
           WHERE framework_id = :frameworkId AND order_no = :order LIMIT 1;`,
          { transaction: t, replacements: { frameworkId, order: ctrl.annex } },
        );
        if (!category?.id) continue;

        const [[existing]] = await queryInterface.sequelize.query(
          `SELECT id FROM verifywise.annexcontrols_struct_iso27001
           WHERE category_id = :categoryId AND control_id = :control_id LIMIT 1;`,
          {
            transaction: t,
            replacements: { categoryId: category.id, control_id: ctrl.control_id },
          },
        );
        let structId = existing?.id;
        if (!structId) {
          const [[inserted]] = await queryInterface.sequelize.query(
            `INSERT INTO verifywise.annexcontrols_struct_iso27001
               (category_id, annex_id, control_id, title, order_no, requirement_summary, is_demo)
             VALUES (:categoryId, :annexStructId, :control_id, :title, :order_no, :requirement_summary, false)
             RETURNING id;`,
            {
              transaction: t,
              replacements: {
                categoryId: category.id,
                annexStructId: annexStruct?.id ?? null,
                control_id: ctrl.control_id,
                title: ctrl.title,
                order_no: ctrl.order_no,
                requirement_summary: ctrl.requirement_summary,
              },
            },
          );
          structId = inserted.id;
        }

        await queryInterface.sequelize.query(
          `INSERT INTO verifywise.annexcontrols_iso27001
             (organization_id, projects_frameworks_id, annexcontrol_meta_id, status)
           SELECT pf.organization_id, pf.id, :structId, 'Not started'
           FROM verifywise.projects_frameworks pf
           WHERE pf.framework_id = :frameworkId
             AND NOT EXISTS (
               SELECT 1 FROM verifywise.annexcontrols_iso27001 ac
               WHERE ac.projects_frameworks_id = pf.id AND ac.annexcontrol_meta_id = :structId
             );`,
          { transaction: t, replacements: { structId, frameworkId } },
        );
      }

      await t.commit();
      console.log(
        "[iso27001-2022] clause 6 split, annex renames, phantom removal, and new controls applied",
      );
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down() {
    // Intentionally no-op. The forward migration is a bulk rename/alignment to
    // the 2022 standard; reverting to the 2013-era mix-up state would introduce
    // more confusion than it resolves. A targeted rollback can be written
    // per-change if needed.
  },
};
