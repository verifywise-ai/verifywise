import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  listAssignmentsQuery,
  createAssignmentsQuery,
  completeAssignmentQuery,
  deleteAssignmentQuery,
  statsForTrainingQuery,
  computeOverdueAssignmentsQuery,
} from "../trainingAssignment.utils";
import { NotFoundException } from "../../domain.layer/exceptions/custom.exception";

const mockQuery = jest.fn(async (..._args: any[]): Promise<any> => []);
jest.mock("../../database/db", () => ({
  sequelize: { query: (...args: any[]) => mockQuery(...args) },
}));

/** Route a mocked sequelize.query by the SQL it receives. */
const mockBySql = (handler: (sql: string, replacements: any) => any) => {
  mockQuery.mockImplementation(async (sql: string, opts: any) => handler(sql, opts?.replacements));
};

const EXISTS_OK = [{ ok: 1 }];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("listAssignmentsQuery", () => {
  it("scopes to the org and applies optional filters", async () => {
    mockBySql((sql, replacements) => {
      expect(sql).toContain("FROM training_assignments");
      expect(replacements.organizationId).toBe(7);
      if (sql.includes("training_id = :trainingId")) {
        expect(replacements.trainingId).toBe(5);
      }
      if (sql.includes("status = :status")) {
        expect(replacements.status).toBe("overdue");
      }
      return [];
    });

    await listAssignmentsQuery(7, { trainingId: 5, status: "overdue" });
    expect(mockQuery).toHaveBeenCalled();
  });

  it("rejects an unknown status", async () => {
    await expect(listAssignmentsQuery(7, { status: "bogus" as any })).rejects.toThrow(
      "status must be one of pending, completed, overdue",
    );
  });
});

describe("createAssignmentsQuery", () => {
  const baseValidation = () => {
    mockBySql((sql, replacements) => {
      if (sql.includes("FROM trainingregistar")) return EXISTS_OK;
      if (sql.includes("FROM organization_members")) return EXISTS_OK;
      if (sql.startsWith("INSERT INTO training_assignments")) {
        return [
          {
            id: 1,
            organization_id: replacements.organizationId,
            training_id: replacements.trainingId,
            subject_type: replacements.subjectType,
            subject_id: replacements.subjectId,
            status: "pending",
          },
        ];
      }
      return [];
    });
  };

  it("creates a user assignment after validating org membership", async () => {
    baseValidation();

    const result = await createAssignmentsQuery(
      [{ trainingId: 5, subjectType: "user", subjectId: 9, dueDate: "2026-12-01" }],
      7,
      3,
    );

    expect(result.created).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    const insertCall = mockQuery.mock.calls.find((c: any[]) =>
      String(c[0]).startsWith("INSERT INTO training_assignments"),
    );
    expect(insertCall?.[1]?.replacements).toMatchObject({
      organizationId: 7,
      trainingId: 5,
      subjectType: "user",
      subjectId: 9,
      assignedBy: 3,
    });
  });

  it("turns a duplicate (23505) into an error entry instead of throwing", async () => {
    baseValidation();
    mockBySql((sql) => {
      if (sql.startsWith("INSERT INTO training_assignments")) {
        const err: any = new Error("duplicate key");
        err.original = { code: "23505" };
        throw err;
      }
      return EXISTS_OK;
    });

    const result = await createAssignmentsQuery(
      [{ trainingId: 5, subjectType: "user", subjectId: 9 }],
      7,
      null,
    );
    expect(result.created).toHaveLength(0);
    expect(result.errors).toEqual([
      { index: 0, message: expect.stringContaining("already exists") },
    ]);
  });

  it("records an error entry for a training outside the org and keeps going", async () => {
    mockBySql((sql) => {
      if (sql.includes("FROM trainingregistar")) return []; // not found
      return EXISTS_OK;
    });

    const result = await createAssignmentsQuery(
      [
        { trainingId: 5, subjectType: "user", subjectId: 9 },
        { trainingId: 6, subjectType: "user", subjectId: 10 },
      ],
      7,
      null,
    );
    expect(result.created).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });

  it("validates a group subject through the groups table", async () => {
    mockBySql((sql, replacements) => {
      if (sql.includes("FROM trainingregistar")) return EXISTS_OK;
      if (sql.includes("FROM groups")) {
        expect(replacements.groupId).toBe(4);
        return EXISTS_OK;
      }
      if (sql.startsWith("INSERT INTO training_assignments")) {
        return [{ id: 2, subject_type: "group", subject_id: 4, status: "pending" }];
      }
      return [];
    });

    const result = await createAssignmentsQuery(
      [{ trainingId: 5, subjectType: "group", subjectId: 4 }],
      7,
      3,
    );
    expect(result.created).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects an empty batch", async () => {
    await expect(createAssignmentsQuery([], 7, null)).rejects.toThrow(
      "assignments must be a non-empty array",
    );
  });
});

describe("completeAssignmentQuery", () => {
  it("returns the updated row", async () => {
    mockQuery.mockResolvedValue([{ id: 11, status: "completed" }]);
    const row = await completeAssignmentQuery(11, 7);
    expect(row.status).toBe("completed");
  });

  it("throws NotFoundException when the row is not in the org", async () => {
    mockQuery.mockResolvedValue([]);
    await expect(completeAssignmentQuery(99, 7)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("deleteAssignmentQuery", () => {
  it("returns true when a row was deleted", async () => {
    mockQuery.mockResolvedValue([{ id: 11 }]);
    expect(await deleteAssignmentQuery(11, 7)).toBe(true);
  });

  it("returns false when nothing matched", async () => {
    mockQuery.mockResolvedValue([]);
    expect(await deleteAssignmentQuery(99, 7)).toBe(false);
  });
});

describe("statsForTrainingQuery", () => {
  it("aggregates counts for one training", async () => {
    mockQuery.mockResolvedValue([
      { training_id: 5, status: "pending", count: 3 },
      { training_id: 5, status: "completed", count: 7 },
      { training_id: 5, status: "overdue", count: 2 },
    ]);
    const stats = await statsForTrainingQuery(7, 5);
    expect(stats).toEqual({
      training_id: 5,
      pending: 3,
      completed: 7,
      overdue: 2,
      total: 12,
    });
  });
});

describe("computeOverdueAssignmentsQuery", () => {
  it("returns the ids that flipped to overdue", async () => {
    mockQuery.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    expect(await computeOverdueAssignmentsQuery(7)).toEqual([1, 2]);
    const [sql, opts] = mockQuery.mock.calls[0] as any[];
    expect(sql).toContain("SET status = 'overdue'");
    expect(opts.replacements.organizationId).toBe(7);
  });
});
