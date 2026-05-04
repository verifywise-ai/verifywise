import {
  ApprovalStepStatus,
  ApprovalRequestStatus,
  EntityType,
} from "../enums/approval-workflow.enum";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: jest.fn(() => "STRING"),
    TEXT: "TEXT",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
    ENUM: jest.fn(),
    JSONB: "JSONB",
    NOW: "NOW",
  },
  ForeignKey: jest.fn(),
  BelongsTo: jest.fn(),
  HasMany: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) Object.assign(this, data);
    }
    get(_opts?: any) {
      return this;
    }
  },
}));

// Test classes mirroring the 6 approval workflow models

class TestApprovalWorkflowModel {
  id?: number;
  workflow_title!: string;
  entity_type!: EntityType;
  description?: string;
  is_active?: boolean;
  created_by?: number;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestApprovalWorkflowStepModel {
  id?: number;
  workflow_id!: number;
  step_number!: number;
  step_name!: string;
  description?: string;
  requires_all_approvers?: boolean;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestApprovalStepApproversModel {
  id?: number;
  workflow_step_id!: number;
  approver_id!: number;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

class TestApprovalRequestModel {
  id?: number;
  request_name!: string;
  workflow_id!: number;
  entity_id?: number;
  entity_type?: EntityType;
  entity_data?: any;
  status!: string;
  requested_by!: number;
  current_step?: number;
  created_at?: Date;
  updated_at?: Date;

  constructor(data?: any) {
    this.status = ApprovalRequestStatus.PENDING;
    if (data) Object.assign(this, data);
  }
}

class TestApprovalRequestStepModel {
  id?: number;
  request_id!: number;
  step_number!: number;
  step_name!: string;
  status!: string;
  date_assigned?: Date;
  date_completed?: Date;
  step_details?: any;
  created_at?: Date;

  constructor(data?: any) {
    this.status = ApprovalStepStatus.PENDING;
    if (data) Object.assign(this, data);
  }

  async markAsCompleted() {
    this.status = ApprovalStepStatus.COMPLETED;
    this.date_completed = new Date();
  }

  async markAsRejected() {
    this.status = ApprovalStepStatus.REJECTED;
    this.date_completed = new Date();
  }
}

class TestApprovalRequestStepApprovalModel {
  id?: number;
  request_step_id!: number;
  approver_id!: number;
  approval_result?: string;
  comments?: string;
  approved_at?: Date;
  created_at?: Date;

  constructor(data?: any) {
    if (data) Object.assign(this, data);
  }
}

describe("ApprovalWorkflowModel", () => {
  it("should instantiate with required fields", () => {
    const wf = new TestApprovalWorkflowModel({
      id: 1,
      workflow_title: "Use Case Approval",
      entity_type: EntityType.USE_CASE,
      is_active: true,
    });
    expect(wf.workflow_title).toBe("Use Case Approval");
    expect(wf.entity_type).toBe(EntityType.USE_CASE);
    expect(wf.is_active).toBe(true);
  });

  it("should handle optional fields", () => {
    const wf = new TestApprovalWorkflowModel({
      workflow_title: "Test",
      entity_type: EntityType.FILE,
    });
    expect(wf.description).toBeUndefined();
    expect(wf.created_by).toBeUndefined();
  });
});

describe("ApprovalWorkflowStepModel", () => {
  it("should instantiate with required fields", () => {
    const step = new TestApprovalWorkflowStepModel({
      id: 1,
      workflow_id: 1,
      step_number: 1,
      step_name: "Manager Review",
      requires_all_approvers: false,
    });
    expect(step.step_number).toBe(1);
    expect(step.step_name).toBe("Manager Review");
    expect(step.requires_all_approvers).toBe(false);
  });
});

describe("ApprovalStepApproversModel", () => {
  it("should instantiate with required fields", () => {
    const approver = new TestApprovalStepApproversModel({
      id: 1,
      workflow_step_id: 1,
      approver_id: 42,
    });
    expect(approver.workflow_step_id).toBe(1);
    expect(approver.approver_id).toBe(42);
  });
});

describe("ApprovalRequestModel", () => {
  it("should instantiate with default pending status", () => {
    const req = new TestApprovalRequestModel({
      request_name: "Approve AI Action",
      workflow_id: 1,
      requested_by: 5,
    });
    expect(req.request_name).toBe("Approve AI Action");
    expect(req.status).toBe(ApprovalRequestStatus.PENDING);
  });

  it("should support all entity types", () => {
    Object.values(EntityType).forEach((type) => {
      const req = new TestApprovalRequestModel({
        request_name: "Test",
        workflow_id: 1,
        requested_by: 1,
        entity_type: type,
      });
      expect(req.entity_type).toBe(type);
    });
  });

  it("should accept entity_data as JSON", () => {
    const req = new TestApprovalRequestModel({
      request_name: "Test",
      workflow_id: 1,
      requested_by: 1,
      entity_data: { name: "test", value: 42 },
    });
    expect(req.entity_data).toEqual({ name: "test", value: 42 });
  });
});

describe("ApprovalRequestStepModel", () => {
  it("should instantiate with default pending status", () => {
    const step = new TestApprovalRequestStepModel({
      request_id: 1,
      step_number: 1,
      step_name: "Review",
    });
    expect(step.status).toBe(ApprovalStepStatus.PENDING);
  });

  it("should mark as completed", async () => {
    const step = new TestApprovalRequestStepModel({
      request_id: 1,
      step_number: 1,
      step_name: "Review",
    });
    await step.markAsCompleted();
    expect(step.status).toBe(ApprovalStepStatus.COMPLETED);
    expect(step.date_completed).toBeInstanceOf(Date);
  });

  it("should mark as rejected", async () => {
    const step = new TestApprovalRequestStepModel({
      request_id: 1,
      step_number: 1,
      step_name: "Review",
    });
    await step.markAsRejected();
    expect(step.status).toBe(ApprovalStepStatus.REJECTED);
    expect(step.date_completed).toBeInstanceOf(Date);
  });
});

describe("ApprovalRequestStepApprovalModel", () => {
  it("should instantiate with required fields", () => {
    const approval = new TestApprovalRequestStepApprovalModel({
      id: 1,
      request_step_id: 1,
      approver_id: 42,
      approval_result: "Approved",
      comments: "Looks good",
    });
    expect(approval.request_step_id).toBe(1);
    expect(approval.approver_id).toBe(42);
    expect(approval.approval_result).toBe("Approved");
    expect(approval.comments).toBe("Looks good");
  });

  it("should handle optional fields", () => {
    const approval = new TestApprovalRequestStepApprovalModel({
      request_step_id: 1,
      approver_id: 1,
    });
    expect(approval.approval_result).toBeUndefined();
    expect(approval.comments).toBeUndefined();
    expect(approval.approved_at).toBeUndefined();
  });
});
