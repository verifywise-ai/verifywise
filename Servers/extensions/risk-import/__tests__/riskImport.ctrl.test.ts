jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../../utils/user.utils", () => ({ findUsersNotInOrganization: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  logStructured: jest.fn(),
}));

import { Request } from "express";
import { getTranslator } from "../../../utils/i18n.utils";
import { translateImportError } from "../riskImport.ctrl";
import { MAX_IMPORT_ROWS } from "../../importLimits";
import { RISK_IMPORT_MESSAGES } from "../riskImport.service";

const reqIn = (lang: "en" | "de" | "fr") => ({ t: getTranslator(lang) }) as unknown as Request;

describe("translateImportError", () => {
  it("translates the row cap from its key with the cap filled in", () => {
    const out = translateImportError(reqIn("de"), {
      row: 0,
      field: "file",
      message: "English text",
      messageKey: RISK_IMPORT_MESSAGES.tooManyRows,
      params: { max: MAX_IMPORT_ROWS },
    });
    expect(out).toEqual({
      row: 0,
      field: "file",
      message: `Diese Datei hat mehr als ${MAX_IMPORT_ROWS} Zeilen. Teilen Sie sie in kleinere Dateien auf und importieren Sie jede einzeln.`,
    });
  });

  it("translates a refused insert from its key and does not send the key", () => {
    const out = translateImportError(reqIn("fr"), {
      row: 4,
      field: "general",
      message: "This row could not be saved.",
      messageKey: RISK_IMPORT_MESSAGES.rowNotSaved,
    });
    expect(out.message).not.toBe("This row could not be saved.");
    expect(out).not.toHaveProperty("messageKey");
    expect(out).not.toHaveProperty("params");
    expect(out).toMatchObject({ row: 4, field: "general" });
  });

  it("leaves a validation message without a key as it is", () => {
    const error = { row: 2, field: "risk_name", message: "Risk name is required" };
    expect(translateImportError(reqIn("de"), error)).toEqual(error);
  });
});
