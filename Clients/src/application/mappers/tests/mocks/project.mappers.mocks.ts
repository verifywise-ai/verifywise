import { ProjectResponseDTO } from "../../../../application/dtos";

const projectDto: ProjectResponseDTO = {
  id: 1,
  uc_id: "uc_123",
  project_title: "Project Alpha",
  owner: 2,
  members: ["member1", "member2"],
  start_date: "2024-01-01",
  ai_risk_classification: 2,
  type_of_high_risk_role: 1,
  goal: "Develop AI model",
  last_updated: "2024-05-01",
  last_updated_by: 2,
  framework: [
    {
      project_framework_id: 1,
      framework_id: 1,
      name: "Framework A",
    },
  ],
  monitored_regulations_and_standards: ["Regulation A", "Standard B"],
  geography: 1,
  target_industry: "Healthcare",
  description: "A project to develop an AI model for healthcare.",
  is_organizational: true,
  status: "active",
  is_demo: false,
  created_at: "2024-01-01",
};

export class ProjectDtoToProjectBuilder {
  private readonly project: Partial<ProjectResponseDTO>;
  constructor(id: number = 1) {
    this.project = { ...projectDto };
    this.project.id = id;
  }

  withNoMembers(): this {
    this.project.members = undefined;
    return this;
  }

  withNumberMembers(): this {
    this.project.members = [1, 2, 3];
    return this;
  }

  withNoFramework(): this {
    this.project.framework = undefined;
    return this;
  }

  withNoMonitoredRegulations(): this {
    this.project.monitored_regulations_and_standards = undefined;
    return this;
  }

  withNumberMonitoredRegulations(): this {
    this.project.monitored_regulations_and_standards = [101, 202];
    return this;
  }

  build(): Partial<ProjectResponseDTO> {
    return this.project;
  }
}

export class ProjectDtoToModelBuilder {
  private readonly project: ProjectResponseDTO;

  constructor(id: number = 1) {
    this.project = { ...projectDto };
    this.project.id = id;
  }

  withoutCreatedAt(): this {
    this.project.created_at = undefined;
    return this;
  }

  withoutIsOrganizational(): this {
    this.project.is_organizational = undefined;
    return this;
  }

  build(): ProjectResponseDTO {
    return this.project;
  }
}

export class ProjectFromBuilder {
  private readonly project = {
    project_title: "Project Beta",
    owner: 3,
    members: [
      {
        _id: 1,
        name: "Alice",
        surname: "Smith",
        email: "alice.smith@email.com",
      },
      {
        _id: 2,
        name: "Bob",
        surname: "Johnson",
        email: "bob.johnson@email.com",
      },
    ],
    start_date: "2024-02-01",
    ai_risk_classification: 3,
    type_of_high_risk_role: 2,
    goal: "Create AI solution",
  };

  build() {
    return this.project;
  }
}
