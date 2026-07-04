import { UserDateFormat } from "../../../enums/userDateFormat.enum";

export type UserLanguage = "en" | "de" | "fr" | "es";

export class UserPreferencesModel {
  id?: number;
  user_id!: number;
  date_format!: UserDateFormat;
  language?: UserLanguage;

  constructor(data: UserPreferencesModel) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.date_format = data.date_format;
    this.language = data.language;
  }

  static createNewUserPreferences(data: UserPreferencesModel): UserPreferencesModel {
    return new UserPreferencesModel(data);
  }
}
