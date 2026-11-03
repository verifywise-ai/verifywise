/**
 * Environment for contract suites that build the real app.
 *
 * Imported before the app: utils/tokens.utils.ts throws at module load when
 * neither API_TOKEN_HASH_SECRET nor ENCRYPTION_KEY is set, and the unit job
 * (test:unit / test:coverage) sets neither. A value already in the
 * environment wins; an empty one counts as unset, as in tokens.utils.ts.
 */
process.env.ENCRYPTION_KEY ||= "contract-tests-only-not-a-real-key";
