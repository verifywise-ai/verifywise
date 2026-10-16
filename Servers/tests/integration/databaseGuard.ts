/**
 * The integration suite's connection-level checks of the test-database rule
 * (tests/testDatabaseGuard.js). Deliberately imports neither database/db.ts
 * nor the seeding helpers, so setupDatabaseGuard.ts can load it in every
 * integration test file at almost no cost.
 */

const testDatabaseGuard = require("../testDatabaseGuard");
const { resolveTestDbName } = require("../../database/config/loadEnv");

/** The raw pg client sequelize hands to its afterConnect hook. */
export interface RawConnection {
  query: (sql: string) => Promise<{ rows: { name?: string }[] }>;
  end?: () => unknown;
}

/** Where this process's DB_NAME came from, so a refusal names the file (or export) to fix. */
function dbNameOrigin() {
  const { source, envTestPath, envTestExists } = resolveTestDbName();
  return { source, envTestPath, envTestExists };
}

function assertSafe(currentDb: string | undefined): void {
  testDatabaseGuard.assertSafeToTruncate({
    currentDb,
    devDbName: testDatabaseGuard.readDevDbName(),
    origin: dbNameOrigin(),
  });
}

/** Close a refused connection; a failure to close must not hide the refusal. */
async function closeQuietly(connection: RawConnection): Promise<void> {
  try {
    await connection.end?.();
  } catch {
    // The refusal below is what matters; the connection is unusable either way.
  }
}

/**
 * afterConnect check: asks the new raw connection itself which database it
 * reached, every time, with no cache (a pool opens only a handful of
 * connections per test file, and a cache shared with a lookup that needs a
 * pool connection could wait on itself). A refused connection is closed
 * before the error propagates — sequelize does not close a connection whose
 * afterConnect hook throws, so it would otherwise stay open on the server.
 */
export async function assertConnectionIsTestDatabase(connection: RawConnection): Promise<void> {
  try {
    const result = await connection.query("SELECT current_database() AS name");
    assertSafe(result.rows[0]?.name);
  } catch (error) {
    await closeQuietly(connection);
    throw error;
  }
}

/** Verdict for this module instance (one per test file); a refusal is kept too. */
let connectedDatabaseVerdict: Promise<void> | undefined;

/**
 * cleanupDatabase()'s check, right before it truncates. Asks Postgres once per
 * test file through `currentDatabase` and reuses the verdict, so a
 * cleanupDatabase() in every beforeEach costs nothing extra. The connection
 * the lookup uses is itself checked, uncached, by the afterConnect hook.
 */
export function assertConnectedToTestDatabase(
  currentDatabase: () => Promise<string | undefined>,
): Promise<void> {
  connectedDatabaseVerdict ??= currentDatabase().then(assertSafe);
  return connectedDatabaseVerdict;
}
