import { UserDateFormat } from "../../../enums/userDateFormat.enum";

export type UserLanguage = "en" | "de" | "fr" | "es";
export type UserTheme = "light" | "dark" | "system";

export class UserPreferencesModel {
  id?: number;
  user_id!: number;
  date_format!: UserDateFormat;
  language?: UserLanguage;
  theme?: UserTheme;
  parallel_agents?: boolean;

  constructor(data: UserPreferencesModel) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.date_format = data.date_format;
    this.language = data.language;
    this.theme = data.theme;
    this.parallel_agents = data.parallel_agents;
  }

  static createNewUserPreferences(data: UserPreferencesModel): UserPreferencesModel {
    return new UserPreferencesModel(data);
  }
}
