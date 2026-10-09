"use strict";

/**
 * Multiple owners per agent primitive.
 *
 * This junction table holds the full set of accountable owners of a manual
 * agent (primary first, by row id), and is the source of truth for them.
 * agent_primitives.owner_id is kept as the PRIMARY owner for backward
 * compatibility. It is also where a synced agent's source-reported owner lives,
 * and where a manual agent keeps a free-text owner sent to the old single-owner
 * API; neither of those has rows here.
 *
 * Deleting a user removes their ownership rows (ON DELETE CASCADE); user
 * deletion also moves a manual agent's owner_id to the next remaining owner.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS verifywise.agent_primitive_owners (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL
          REFERENCES verifywise.organizations(id) ON DELETE CASCADE,
        agent_primitive_id INTEGER NOT NULL
          REFERENCES verifywise.agent_primitives(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL
          REFERENCES verifywise.users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (organization_id, agent_primitive_id, user_id)
      );
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_primitive_owners_agent
        ON verifywise.agent_primitive_owners (organization_id, agent_primitive_id);
    `);

    // Backfill: a manual agent's existing single owner becomes its first owner
    // row, when owner_id is a user id of a user in the same organization.
    // Anything else in owner_id (free text, a deleted user, another
    // organization's user) gets no row and stays as it is.
    //
    // The cast is guarded so it can never fail: only 1 to 10 ASCII digits
    // reach ::bigint (at most 9,999,999,999, well inside BIGINT), and the CASE
    // keeps the cast from being evaluated for any other value. An id beyond
    // INTEGER range simply matches no user.
    await queryInterface.sequelize.query(`
      INSERT INTO verifywise.agent_primitive_owners
        (organization_id, agent_primitive_id, user_id, created_at)
      SELECT ap.organization_id, ap.id, u.id, NOW()
      FROM verifywise.agent_primitives ap
      JOIN verifywise.users u
        ON u.organization_id = ap.organization_id
       AND u.id = CASE
             WHEN btrim(ap.owner_id) ~ '^[0-9]{1,10}$' THEN btrim(ap.owner_id)::bigint
           END
      WHERE ap.is_manual = true
      ON CONFLICT (organization_id, agent_primitive_id, user_id) DO NOTHING;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("DROP TABLE IF EXISTS verifywise.agent_primitive_owners;");
  },
};
