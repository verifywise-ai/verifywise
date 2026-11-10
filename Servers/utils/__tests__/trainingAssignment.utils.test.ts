jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));

import { deriveAssignmentStatus } from "../trainingAssignment.utils";

const TODAY = "2026-11-09";

describe("deriveAssignmentStatus", () => {
  it("is completed once completed_at is set, even past the due date", () => {
    expect(deriveAssignmentStatus("2026-11-01T10:00:00Z", "2026-10-01", TODAY)).toBe("completed");
    expect(deriveAssignmentStatus(new Date(), "2026-12-01", TODAY)).toBe("completed");
  });

  it("is overdue only after the due date has passed", () => {
    expect(deriveAssignmentStatus(null, "2026-11-08", TODAY)).toBe("overdue");
    expect(deriveAssignmentStatus(null, TODAY, TODAY)).toBe("pending");
    expect(deriveAssignmentStatus(null, "2026-11-10", TODAY)).toBe("pending");
  });
});
