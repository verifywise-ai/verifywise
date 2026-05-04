import { Transaction } from "sequelize";
import { sequelize } from "../database/db";
import { UserPreferencesModel } from "../domain.layer/models/userPreferences/userPreferences.model";

export const getPreferencesByUserQuery = async (
  userId: number,
): Promise<UserPreferencesModel | null> => {
  try {
    const [preference] = await sequelize.query(
      `SELECT * FROM user_preferences WHERE user_id = :id`,
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
  const result = await sequelize.query(
    `INSERT INTO user_preferences (user_id, date_format) VALUES (:user_id, :date_format) RETURNING *`,
    {
      replacements: {
        user_id: data.user_id,
        date_format: data.date_format,
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
  const updatedData: Partial<Record<keyof UserPreferencesModel, any>> = {};
  const setClause = ["date_format"]
    .filter((f) => {
      if (
        data[f as keyof UserPreferencesModel] !== undefined &&
        data[f as keyof UserPreferencesModel]
      ) {
        updatedData[f as keyof UserPreferencesModel] = data[f as keyof UserPreferencesModel];
        return true;
      }
      return false;
    })
    .map((f) => `${f} = :${f}`)
    .join(", ");

  const query = `UPDATE user_preferences SET ${setClause} WHERE user_id = :id RETURNING *;`;

  updatedData.id = id;

  const result = await sequelize.query(query, {
    replacements: updatedData,
    mapToModel: true,
    model: UserPreferencesModel,
    transaction,
  });

  return result[0];
};
