import { Model, Table, Column, DataType, ForeignKey } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { IUserPreferences, UserLanguage } from "../../interfaces/i.userPreferences";
import { UserDateFormat } from "../../enums/user-preferences.enum";
import { ValidationException } from "../../exceptions/custom.exception";

const VALID_LANGUAGES: UserLanguage[] = ["en", "de", "fr"];

@Table({
  tableName: "user_preferences",
  timestamps: true,
  underscored: true,
})
export class UserPreferencesModel extends Model<UserPreferencesModel> implements IUserPreferences {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  id!: number;

  @ForeignKey(() => UserModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    unique: true,
  })
  user_id!: number;

  @Column({
    type: DataType.ENUM(...Object.values(UserDateFormat)),
    defaultValue: UserDateFormat.DD_MM_YYYY_DASH,
    allowNull: false,
  })
  date_format!: UserDateFormat;

  @Column({
    type: DataType.STRING(8),
    defaultValue: "en",
    allowNull: false,
  })
  language!: UserLanguage;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at?: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;

  /**
   * Create new user preferences
   * @param user_id - ID of the user
   * @param date_format - Preferred date format
   * @returns Newly created UserPreferences instance
   */
  static async createNewUserPreferences(
    user_id: number,
    date_format: UserDateFormat,
    language?: UserLanguage,
  ): Promise<UserPreferencesModel> {
    const userPreferencesData = new UserPreferencesModel();

    const validDateFormats = Object.values(UserDateFormat);
    if (!validDateFormats.includes(date_format)) {
      const options = validDateFormats.join(", ");
      throw new ValidationException(
        `Invalid date format. Must be one of: ${options}`,
        undefined,
        undefined,
        { i18nKey: "Invalid date format. Must be one of: {options}", i18nVars: { options } },
      );
    }

    if (language !== undefined && !VALID_LANGUAGES.includes(language)) {
      const options = VALID_LANGUAGES.join(", ");
      throw new ValidationException(
        `Invalid language. Must be one of: ${options}`,
        undefined,
        undefined,
        { i18nKey: "Invalid language. Must be one of: {options}", i18nVars: { options } },
      );
    }

    userPreferencesData.user_id = user_id;
    userPreferencesData.date_format = date_format;
    userPreferencesData.language = language ?? "en";

    return userPreferencesData;
  }

  /**
   * Update user preferences
   * @param updatedUserPreferences - Updated user preferences data
   * @returns void
   */
  async updateUserPreferences(updatedUserPreferences: {
    date_format?: UserDateFormat;
    language?: UserLanguage;
  }): Promise<void> {
    if (updatedUserPreferences.date_format !== undefined) {
      this.date_format = updatedUserPreferences.date_format;
    }
    if (updatedUserPreferences.language !== undefined) {
      this.language = updatedUserPreferences.language;
    }

    await this.validateUserPreferences();
  }

  /**
   * Validate user preferences
   * @returns void
   */
  async validateUserPreferences(): Promise<void> {
    const validDateFormats = Object.values(UserDateFormat);
    if (
      this.date_format !== undefined &&
      this.date_format !== null &&
      !validDateFormats.includes(this.date_format)
    ) {
      const options = validDateFormats.join(", ");
      throw new ValidationException(
        `Invalid date format. Must be one of: ${options}`,
        undefined,
        undefined,
        { i18nKey: "Invalid date format. Must be one of: {options}", i18nVars: { options } },
      );
    }
    if (this.language !== undefined && !VALID_LANGUAGES.includes(this.language)) {
      const options = VALID_LANGUAGES.join(", ");
      throw new ValidationException(
        `Invalid language. Must be one of: ${options}`,
        undefined,
        undefined,
        { i18nKey: "Invalid language. Must be one of: {options}", i18nVars: { options } },
      );
    }
  }

  /**
   * Convert UserPreferences instance to JSON
   * @returns IUserPreferences object
   */
  toJSON(): IUserPreferences {
    return {
      id: this.id,
      user_id: this.user_id,
      date_format: this.date_format,
      language: this.language,
    };
  }
}
