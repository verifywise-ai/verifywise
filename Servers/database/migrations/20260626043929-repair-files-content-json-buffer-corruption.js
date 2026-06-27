"use strict";

/**
 * Repair `files.content` rows whose binary was stored as JSON text instead of
 * raw bytes.
 *
 * Background
 * ----------
 * An older upload path serialized the uploaded buffer with
 * `JSON.stringify(buffer.toJSON())` before the INSERT, so the `bytea` column
 * ended up holding the literal text `{"type":"Buffer","data":[37,80,68,70,...]}`
 * instead of the file's raw bytes. Downloads returned that JSON faithfully, so
 * the file opened as "damaged". The current upload code (fileUpload.utils.ts and
 * file.repository.ts) binds the raw Buffer directly, so no new rows are
 * corrupted — this migration only repairs the historical data.
 *
 * The original bytes are fully preserved inside the JSON `data` array, so the
 * repair is lossless: parse the wrapper and rewrite `content` as the raw bytea.
 *
 * Why JavaScript instead of pure SQL
 * ----------------------------------
 * A pure-SQL reconstruction (unnest the JSON `data` array to one row per byte,
 * then re-aggregate) explodes a multi-MB file into millions of rows and spills
 * to disk — on a constrained host it fails with "No space left on device".
 * Reconstructing with `Buffer.from(obj.data)` in Node is O(bytes) in memory,
 * processes one row at a time, and writes back only the small raw buffer.
 *
 * Safety guards (per row)
 * -----------------------
 * - Only rows whose content begins with the wrapper signature
 *   (`{"type":"Buffer"`) are touched. Already-correct binary rows are skipped.
 * - The parsed object must be a Buffer wrapper with an array `data`.
 * - The reconstructed length must equal the wrapper's declared `data` length,
 *   otherwise the row is skipped (never overwrite with a partial reconstruction).
 *
 * Irreversible: `down()` is intentionally a no-op. The repaired rows hold the
 * correct raw bytes; re-wrapping them as JSON text would re-introduce the
 * corruption, so we do not.
 */

const WRAPPER_PREFIX = '{"type":"Buffer"';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;

    // Identify candidate rows without pulling their (large) content. The first
    // 16 bytes of the bytea are enough to detect the JSON wrapper.
    const [candidates] = await sequelize.query(`
      SELECT id
      FROM verifywise.files
      WHERE content IS NOT NULL
        AND get_byte(content, 0) = 123                              -- leading '{'
        AND left(convert_from(substring(content FROM 1 FOR 16), 'UTF8'), 16) = '${WRAPPER_PREFIX}'
      ORDER BY id
    `);

    let repaired = 0;
    let skipped = 0;

    for (const { id } of candidates) {
      // Fetch one row's content at a time to bound memory.
      const [[row]] = await sequelize.query("SELECT content FROM verifywise.files WHERE id = :id", {
        replacements: { id },
      });
      if (!row || !row.content) {
        skipped++;
        continue;
      }

      const buf = Buffer.isBuffer(row.content) ? row.content : Buffer.from(row.content);
      if (!buf.subarray(0, 16).toString("latin1").startsWith(WRAPPER_PREFIX)) {
        skipped++;
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(buf.toString("utf8"));
      } catch {
        skipped++;
        continue;
      }

      if (!parsed || parsed.type !== "Buffer" || !Array.isArray(parsed.data)) {
        skipped++;
        continue;
      }

      const raw = Buffer.from(parsed.data);
      if (raw.length !== parsed.data.length) {
        skipped++;
        continue;
      }

      await sequelize.query("UPDATE verifywise.files SET content = :content WHERE id = :id", {
        replacements: { content: raw, id },
      });
      repaired++;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[repair-files-content] candidates=${candidates.length} repaired=${repaired} skipped=${skipped}`,
    );
  },

  async down() {
    // Intentionally irreversible. The repaired rows now hold the correct raw
    // bytes; reconstructing the JSON-text wrapper would re-corrupt valid data.
  },
};
