import { QueryTypes, Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { isSupportedLang, type SupportedLang } from "./i18n.utils";
import { UserPreferencesModel } from "../domain.layer/models/userPreferences/userPreferences.model";

export const getPreferencesByUserQuery = async (
  userId: number,
): Promise<UserPreferencesModel | null> => {
  try {
    // date_format and parallel_agents live inside the JSONB `preferences`
    // column; surface them as top-level fields so mapToModel can hydrate them.
    const [preference] = await sequelize.query(
      `SELECT *, (preferences->>'date_format') AS date_format, (preferences->>'parallel_agents')::boolean AS parallel_agents FROM user_preferences WHERE user_id = :id`,
      {
        replacements: { id: userId },
        mapToModel: true,
        model: UserPreferencesModel,
      },
    );

    if (!preference) {
      return null;
    }
    return preference;
  } catch (error) {
    throw error;
  }
};

/**
 * The language a user saved in Settings, for text written outside a request
 * (notifications sent by a nightly job have no Accept-Language to read).
 * "en" when nothing is saved, the language has no backend dictionary, or the
 * read fails: a notification must never be lost over its wording.
 */
export const getUserLanguage = async (userId: number): Promise<SupportedLang> => {
  try {
    const [row] = await sequelize.query<{ language: string | null }>(
      `SELECT language FROM user_preferences WHERE user_id = :id`,
      { replacements: { id: userId }, type: QueryTypes.SELECT },
    );
    return isSupportedLang(row?.language) ? row.language : "en";
  } catch {
    return "en";
  }
};

export const createNewUserPreferencesQuery = async (
  data: Omit<UserPreferencesModel, "id">,
  transaction: Transaction,
): Promise<UserPreferencesModel> => {
  // NOTE: date_format and parallel_agents are stored inside the JSONB
  // `preferences` column, not as top-level columns. `language` is a real
  // column (added in migration 20260424194346).
  const preferences: Record<string, unknown> = {};
  if (data.date_format) {
    preferences.date_format = data.date_format;
  }
  if (typeof data.parallel_agents === "boolean") {
    preferences.parallel_agents = data.parallel_agents;
  }

  const result = await sequelize.query(
    `INSERT INTO user_preferences (user_id, language, preferences) VALUES (:user_id, :language, :preferences::jsonb) RETURNING *`,
    {
      replacements: {
        user_id: data.user_id,
        language: data.language ?? "en",
        preferences: JSON.stringify(preferences),
      },
      mapToModel: true,
      model: UserPreferencesModel,
      transaction,
    },
  );
  return result[0];
};

export const updateUserPreferencesByIdQuery = async (
  id: number,
  data: Partial<UserPreferencesModel>,
  transaction: Transaction,
): Promise<UserPreferencesModel | null> => {
  // language is a top-level column. date_format and parallel_agents live inside
  // the JSONB `preferences` column and must be merged in a single assignment:
  // PostgreSQL uses the original row for every SET expression, so two
  // assignments to `preferences` would drop the first key.
  const setParts: string[] = [];
  const replacements: Record<string, any> = { id };
  const preferenceEntries: string[] = [];

  if (data.language !== undefined) {
    setParts.push("language = :language");
    replacements.language = data.language;
  }
  if (data.date_format !== undefined) {
    preferenceEntries.push("'date_format', :date_format::text");
    replacements.date_format = data.date_format;
  }
  if (typeof data.parallel_agents === "boolean") {
    preferenceEntries.push("'parallel_agents', :parallel_agents::boolean");
    replacements.parallel_agents = data.parallel_agents;
  }
  if (preferenceEntries.length > 0) {
    setParts.push(
      `preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object(${preferenceEntries.join(", ")})`,
    );
  }

  if (setParts.length === 0) {
    // Nothing to update — fetch and return the existing row.
    const existing = await sequelize.query(`SELECT * FROM user_preferences WHERE user_id = :id`, {
      replacements,
      mapToModel: true,
      model: UserPreferencesModel,
      transaction,
    });
    return existing[0] ?? null;
  }

  const query = `UPDATE user_preferences SET ${setParts.join(", ")} WHERE user_id = :id RETURNING *;`;
  const result = await sequelize.query(query, {
    replacements,
    mapToModel: true,
    model: UserPreferencesModel,
    transaction,
  });

  return result[0];
};
