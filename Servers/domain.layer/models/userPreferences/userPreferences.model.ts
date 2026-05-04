import { Model, Table, Column, DataType, ForeignKey } from "sequelize-typescript";
import { UserModel } from "../user/user.model";
import { IUserPreferences } from "../../interfaces/i.userPreferences";
import { UserDateFormat } from "../../enums/user-preferences.enum";
import { ValidationException } from "../../exceptions/custom.exception";

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
  ): Promise<UserPreferencesModel> {
    const userPreferencesData = new UserPreferencesModel();

    const validDateFormats = Object.values(UserDateFormat);
    if (!validDateFormats.includes(date_format)) {
      throw new ValidationException(
        `Invalid date format. Must be one of: ${validDateFormats.join(", ")}`,
      );
    }

    userPreferencesData.user_id = user_id;
    userPreferencesData.date_format = date_format;

    return userPreferencesData;
  }

  /**
   * Update user preferences
   * @param updatedUserPreferences - Updated user preferences data
   * @returns void
   */
  async updateUserPreferences(updatedUserPreferences: {
    date_format?: UserDateFormat;
  }): Promise<void> {
    if (updatedUserPreferences.date_format !== undefined) {
      this.date_format = updatedUserPreferences.date_format;
    }

    await this.validateUserPreferences();
  }

  /**
   * Validate user preferences
   * @returns void
   */
  async validateUserPreferences(): Promise<void> {
    const validDateFormats = Object.values(UserDateFormat);
    if (!validDateFormats.includes(this.date_format)) {
      throw new ValidationException(
        `Invalid date format. Must be one of: ${validDateFormats.join(", ")}`,
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
    };
  }
}
