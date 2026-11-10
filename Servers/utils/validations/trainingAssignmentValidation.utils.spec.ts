import {
  MAX_ASSIGNEES_PER_REQUEST,
  parseAssignmentId,
  parseCreateAssignments,
  parseDueDate,
  parseTrainingId,
  parseTrainingIdQuery,
  parseUserIds,
} from "./trainingAssignmentValidation.utils";

const TODAY = "2026-11-09";

describe("training assignment validation", () => {
  describe("ids", () => {
    it.each(["1", "42"])("accepts %s as path or query text", (value) => {
      expect(parseAssignmentId(value)).toEqual({ ok: true, value: Number(value) });
      expect(parseTrainingIdQuery(value)).toEqual({ ok: true, value: Number(value) });
    });

    it.each([undefined, "", "0", "-1", "1.5", "1abc", "01", "2147483648", ["1"]])(
      "rejects %p",
      (value) => {
        expect(parseAssignmentId(value).ok).toBe(false);
        expect(parseTrainingIdQuery(value).ok).toBe(false);
      },
    );

    it("takes only a real number in the body", () => {
      expect(parseTrainingId(5)).toEqual({ ok: true, value: 5 });
      expect(parseTrainingId("5").ok).toBe(false);
      expect(parseTrainingId(2147483648).ok).toBe(false);
    });
  });

  describe("due date", () => {
    it("accepts today and later", () => {
      expect(parseDueDate(TODAY, TODAY)).toEqual({ ok: true, value: TODAY });
      expect(parseDueDate("2028-02-29", TODAY)).toEqual({ ok: true, value: "2028-02-29" });
    });

    it("rejects the past", () => {
      expect(parseDueDate("2026-11-08", TODAY)).toMatchObject({
        ok: false,
        message: "Due date must be today or later",
      });
    });

    it.each([
      "2026-02-30",
      "2027-02-29",
      "2026-13-01",
      "2026-1-1",
      "11/09/2026",
      "",
      null,
      20261109,
    ])("rejects %p as not a real strict date", (value) => {
      expect(parseDueDate(value, TODAY)).toMatchObject({
        ok: false,
        message: "Due date must be a valid date in YYYY-MM-DD format",
      });
    });
  });

  describe("user ids", () => {
    it("removes duplicates and keeps the order", () => {
      expect(parseUserIds([3, 1, 3, 2, 1])).toEqual({ ok: true, value: [3, 1, 2] });
    });

    it.each([undefined, "1", [], ["1"], [0], [-1], [1.5], [null], [2147483648]])(
      "rejects %p",
      (value) => {
        expect(parseUserIds(value).ok).toBe(false);
      },
    );

    it("counts the limit after removing duplicates", () => {
      const atLimit = Array.from({ length: MAX_ASSIGNEES_PER_REQUEST }, (_, i) => i + 1);
      expect(parseUserIds([...atLimit, ...atLimit]).ok).toBe(true);
      expect(parseUserIds([...atLimit, MAX_ASSIGNEES_PER_REQUEST + 1])).toMatchObject({
        ok: false,
        vars: { max: MAX_ASSIGNEES_PER_REQUEST },
      });
    });
  });

  describe("create body", () => {
    it("returns the cleaned values", () => {
      expect(
        parseCreateAssignments({ training_id: 2, user_ids: [4, 4, 5], due_date: TODAY }, TODAY),
      ).toEqual({ ok: true, value: { training_id: 2, user_ids: [4, 5], due_date: TODAY } });
    });

    it("rejects a missing body", () => {
      expect(parseCreateAssignments(undefined, TODAY).ok).toBe(false);
    });
  });
});
