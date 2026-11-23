import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  INCIDENT_HARM_CATEGORIES_ENUM,
  INCIDENT_SEVERITY_ENUM,
  INCIDENT_STATUS_ENUM,
  INCIDENT_TYPE_ENUM,
  latestIncidentDate,
  parseCreateHarmCategories,
  validateCompleteIncidentCreation,
  validateCompleteIncidentUpdate,
} from "../incidentManagementValidation.utils";
import {
  HarmCategory,
  IncidentType,
  Severity,
} from "../../../domain.layer/enums/ai-incident-management.enum";

const VALID = {
  ai_project: "Support chatbot",
  type: "Malfunction",
  severity: "Serious",
  occurred_date: "2026-06-20",
  date_detected: "2026-06-23",
  reporter: "Ada Lovelace",
  description: "The chatbot gave unsafe advice.",
};

/** The stored row an update is checked against (as the service reads it). */
const STORED = {
  ...VALID,
  status: "Open",
  approval_status: "Pending",
  occurred_date: new Date(2026, 5, 20),
  date_detected: new Date(2026, 5, 23),
  categories_of_harm: ["Safety"],
};

const fields = (errors: { field: string }[]) => errors.map((e) => e.field).sort();
const errorFor = (errors: any[], field: string) => errors.find((e) => e.field === field);

describe("incident field validation", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-11-23T12:00:00Z"), doNotFake: ["nextTick"] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("enums", () => {
    it("come from the domain enums", () => {
      expect(INCIDENT_TYPE_ENUM).toEqual(Object.values(IncidentType));
      expect(INCIDENT_SEVERITY_ENUM).toEqual(Object.values(Severity));
      expect(INCIDENT_STATUS_ENUM).toContain("Emergency action");
    });

    it("harm categories are the page's values, not the old Article 73 list", () => {
      expect(INCIDENT_HARM_CATEGORIES_ENUM).toEqual(Object.values(HarmCategory));
      expect(INCIDENT_HARM_CATEGORIES_ENUM).toEqual([
        "Health",
        "Safety",
        "Rights",
        "Property",
        "Environment",
      ]);
    });
  });

  describe("create", () => {
    it("treats whitespace-only status and approval_status as omitted (defaults)", () => {
      expect(
        validateCompleteIncidentCreation({ ...VALID, status: "  ", approval_status: " " }),
      ).toEqual([]);
    });

    it("accepts a complete incident without status or approval_status (defaults)", () => {
      expect(validateCompleteIncidentCreation(VALID)).toEqual([]);
      expect(
        validateCompleteIncidentCreation({ ...VALID, status: null, approval_status: "" }),
      ).toEqual([]);
    });

    it("requires type, severity, use case, both dates and reporter", () => {
      const errors = validateCompleteIncidentCreation({ description: VALID.description });
      expect(fields(errors)).toEqual(
        ["ai_project", "date_detected", "occurred_date", "reporter", "severity", "type"].sort(),
      );
      expect(errors.every((e) => e.code === "REQUIRED_FIELD")).toBe(true);
    });

    it("refuses blank text for a required field", () => {
      const errors = validateCompleteIncidentCreation({ ...VALID, ai_project: "  ", reporter: "" });
      expect(fields(errors)).toEqual(["ai_project", "reporter"]);
    });

    it.each([
      ["severity", "High"],
      ["severity", "very serious"],
      ["status", "Banana"],
      ["type", "Banana"],
      ["approval_status", "Banana"],
    ])("refuses %s %p with the allowed values", (field, value) => {
      const errors = validateCompleteIncidentCreation({ ...VALID, [field]: value });
      expect(errors).toEqual([
        expect.objectContaining({
          field,
          code: "INVALID_ENUM_VALUE",
          i18nKey: "{field} must be one of: {values}",
          i18nVars: expect.objectContaining({ field }),
        }),
      ]);
    });

    it.each(["ai_project", "reporter", "model_system_version"])(
      "refuses %s over 255 characters (VARCHAR(255) column)",
      (field) => {
        expect(validateCompleteIncidentCreation({ ...VALID, [field]: "a".repeat(255) })).toEqual(
          [],
        );
        const errors = validateCompleteIncidentCreation({ ...VALID, [field]: "a".repeat(256) });
        expect(errors).toEqual([
          expect.objectContaining({
            field,
            code: "MAX_LENGTH",
            message: `${field} must be at most 255 characters`,
            i18nKey: "{field} must be at most {max} characters",
          }),
        ]);
      },
    );

    it("refuses non-text values in text fields and non-booleans in boolean fields", () => {
      const errors = validateCompleteIncidentCreation({
        ...VALID,
        reporter: 42,
        relationship_causality: { a: 1 },
        interim_report: "yes",
      });
      expect(fields(errors)).toEqual(["interim_report", "relationship_causality", "reporter"]);
    });

    it("refuses invalid dates", () => {
      const errors = validateCompleteIncidentCreation({
        ...VALID,
        occurred_date: "2026-02-30",
        date_detected: "not a date",
      });
      expect(fields(errors)).toEqual(["date_detected", "occurred_date"]);
      expect(errors.every((e) => e.code === "INVALID_DATE")).toBe(true);
    });

    it("refuses a detected date before the occurred date", () => {
      const errors = validateCompleteIncidentCreation({
        ...VALID,
        occurred_date: "2026-06-23",
        date_detected: "2026-06-22",
      });
      expect(errors).toEqual([
        expect.objectContaining({ field: "date_detected", code: "INVALID_DATE_ORDER" }),
      ]);
    });

    it("accepts the same day for both dates, including date-times on that day", () => {
      expect(
        validateCompleteIncidentCreation({
          ...VALID,
          occurred_date: "2026-06-23T18:00:00.000Z",
          date_detected: "2026-06-23",
        }),
      ).toEqual([]);
    });

    it("takes the latest date from UTC+14, the furthest-ahead time zone", () => {
      // 09:00 UTC is 23:00 in UTC+14: today everywhere is at most the 23rd.
      expect(latestIncidentDate(new Date("2026-11-23T09:00:00Z"))).toBe("2026-11-23");
      // 10:00 UTC is midnight in UTC+14: the 24th has started there.
      expect(latestIncidentDate(new Date("2026-11-23T10:00:00Z"))).toBe("2026-11-24");
    });

    it("allows today in any time zone and refuses later dates", () => {
      expect(latestIncidentDate()).toBe("2026-11-24");
      expect(
        validateCompleteIncidentCreation({
          ...VALID,
          occurred_date: "2026-11-24",
          date_detected: "2026-11-24",
        }),
      ).toEqual([]);
      const errors = validateCompleteIncidentCreation({
        ...VALID,
        occurred_date: "2026-11-25",
        date_detected: "2026-11-25",
      });
      expect(fields(errors)).toEqual(["date_detected", "occurred_date"]);
      expect(errors.every((e) => e.code === "FUTURE_DATE")).toBe(true);
    });

    describe("harm categories", () => {
      it("accepts a list of page values, an empty list, none, or the comma-separated string", () => {
        for (const categories_of_harm of [
          ["Health", "Rights"],
          [],
          undefined,
          null,
          "Health, Safety",
        ]) {
          expect(validateCompleteIncidentCreation({ ...VALID, categories_of_harm })).toEqual([]);
        }
        expect(parseCreateHarmCategories("Health, Safety")).toEqual(["Health", "Safety"]);
        expect(parseCreateHarmCategories(undefined)).toEqual([]);
      });

      it.each([[42], [{ a: 1 }], [["Health and Safety"]], [["Health", 3]], ["Banana"]])(
        "refuses %p",
        (categories_of_harm) => {
          const errors = validateCompleteIncidentCreation({ ...VALID, categories_of_harm });
          expect(errors).toEqual([
            expect.objectContaining({
              field: "categories_of_harm",
              code: "INVALID_HARM_CATEGORY",
            }),
          ]);
        },
      );
    });
  });

  describe("update (against the stored row)", () => {
    it("accepts an update that omits required fields", () => {
      expect(
        validateCompleteIncidentUpdate({ immediate_mitigations: "Rolled back" }, STORED),
      ).toEqual([]);
    });

    it.each(["type", "severity", "status", "approval_status", "ai_project", "reporter"])(
      "refuses blanking required %s",
      (field) => {
        for (const value of [null, ""]) {
          const errors = validateCompleteIncidentUpdate({ [field]: value }, STORED);
          expect(errors).toEqual([expect.objectContaining({ field, code: "REQUIRED_FIELD" })]);
        }
      },
    );

    it("refuses blanking a date", () => {
      const errors = validateCompleteIncidentUpdate({ occurred_date: null }, STORED);
      expect(errorFor(errors, "occurred_date")).toMatchObject({ code: "REQUIRED_FIELD" });
    });

    it("refuses values outside the enums and over-long text", () => {
      const errors = validateCompleteIncidentUpdate(
        {
          severity: "High",
          status: "Banana",
          type: "Banana",
          model_system_version: "v".repeat(256),
        },
        STORED,
      );
      expect(fields(errors)).toEqual(["model_system_version", "severity", "status", "type"]);
    });

    it("does not re-check values that are unchanged (older rows keep editing)", () => {
      const legacy = { ...STORED, type: "Legacy type", reporter: "r".repeat(300) };
      expect(
        validateCompleteIncidentUpdate(
          { type: "Legacy type", reporter: "r".repeat(300), status: "Closed" },
          legacy,
        ),
      ).toEqual([]);
    });

    it("compares the effective dates: request merged over the stored row", () => {
      // Detected moved before the stored occurred date.
      expect(
        errorFor(
          validateCompleteIncidentUpdate({ date_detected: "2026-06-19" }, STORED),
          "date_detected",
        ),
      ).toMatchObject({ code: "INVALID_DATE_ORDER" });
      // Occurred moved after the stored detected date.
      expect(
        errorFor(
          validateCompleteIncidentUpdate({ occurred_date: "2026-06-24" }, STORED),
          "date_detected",
        ),
      ).toMatchObject({ code: "INVALID_DATE_ORDER" });
      // Both moved together, in order.
      expect(
        validateCompleteIncidentUpdate(
          { occurred_date: "2026-06-01", date_detected: "2026-06-02" },
          STORED,
        ),
      ).toEqual([]);
    });

    it("refuses a future date on update", () => {
      const errors = validateCompleteIncidentUpdate({ date_detected: "2027-01-01" }, STORED);
      expect(errorFor(errors, "date_detected")).toMatchObject({ code: "FUTURE_DATE" });
    });

    it("keeps stored categories outside the list editable; only added items are checked", () => {
      const legacy = { ...STORED, categories_of_harm: ["Health and Safety"] };
      // The drawer sends the full list, including the stored off-list value.
      expect(
        validateCompleteIncidentUpdate(
          { categories_of_harm: ["Health and Safety", "Rights"] },
          legacy,
        ),
      ).toEqual([]);
      // Removing it is fine; so is a JSON-string stored column.
      expect(validateCompleteIncidentUpdate({ categories_of_harm: ["Rights"] }, legacy)).toEqual(
        [],
      );
      expect(
        validateCompleteIncidentUpdate(
          { categories_of_harm: ["Other", "Safety"] },
          { ...STORED, categories_of_harm: '["Other"]' },
        ),
      ).toEqual([]);
      // A new off-list value is still refused.
      expect(
        validateCompleteIncidentUpdate(
          { categories_of_harm: ["Health and Safety", "Bogus"] },
          legacy,
        ),
      ).toEqual([expect.objectContaining({ field: "categories_of_harm" })]);
    });

    it("validates harm categories as a list of page values; null and other JSON are refused", () => {
      expect(validateCompleteIncidentUpdate({ categories_of_harm: ["Health"] }, STORED)).toEqual(
        [],
      );
      expect(validateCompleteIncidentUpdate({ categories_of_harm: [] }, STORED)).toEqual([]);
      for (const categories_of_harm of [null, { a: 1 }, 7, "Health", ["Bogus"]]) {
        const errors = validateCompleteIncidentUpdate({ categories_of_harm }, STORED);
        expect(errors).toEqual([
          expect.objectContaining({ field: "categories_of_harm", code: "INVALID_HARM_CATEGORY" }),
        ]);
      }
    });
  });
});
