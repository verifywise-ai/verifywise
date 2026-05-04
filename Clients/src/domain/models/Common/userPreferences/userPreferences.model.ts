import { UserDateFormat } from "../../../enums/userDateFormat.enum";

export class UserPreferencesModel {
  id?: number;
  user_id!: number;
  date_format!: UserDateFormat;

  constructor(data: UserPreferencesModel) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.date_format = data.date_format;
  }

  static createNewUserPreferences(data: UserPreferencesModel): UserPreferencesModel {
    return new UserPreferencesModel(data);
  }
}
