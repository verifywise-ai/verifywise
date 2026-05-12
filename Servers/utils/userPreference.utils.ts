import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { UserPreferencesModel } from "../domain.layer/models/userPreferences/userPreferences.model";

export const getPreferencesByUserQuery = async (
  userId: number,
): Promise<UserPreferencesModel | null> => {
  try {
    // date_format lives inside the JSONB `preferences` column; surface it as a
    // top-level field so mapToModel hydrates the model's date_format property.
    const [preference] = await sequelize.query(
      `SELECT *, (preferences->>'date_format') AS date_format FROM user_preferences WHERE user_id = :id`,
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

export const createNewUserPreferencesQuery = async (
  data: Omit<UserPreferencesModel, "id">,
  transaction: Transaction,
): Promise<UserPreferencesModel> => {
  // NOTE: date_format is stored inside the JSONB `preferences` column on this
  // table, not as a top-level column. We persist `language` as a real column
  // (added in migration 20260424194346) and stash other prefs in JSONB.
  const result = await sequelize.query(
    `INSERT INTO user_preferences (user_id, language, preferences) VALUES (:user_id, :language, :preferences::jsonb) RETURNING *`,
    {
      replacements: {
        user_id: data.user_id,
        language: data.language ?? "en",
        preferences: JSON.stringify(data.date_format ? { date_format: data.date_format } : {}),
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
  // language is a top-level column; date_format lives inside the JSONB
  // `preferences` column. Build the SET clause accordingly.
  const setParts: string[] = [];
  const replacements: Record<string, any> = { id };

  if (data.language !== undefined) {
    setParts.push("language = :language");
    replacements.language = data.language;
  }
  if (data.date_format !== undefined) {
    setParts.push(
      "preferences = COALESCE(preferences, '{}'::jsonb) || jsonb_build_object('date_format', :date_format::text)",
    );
    replacements.date_format = data.date_format;
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
