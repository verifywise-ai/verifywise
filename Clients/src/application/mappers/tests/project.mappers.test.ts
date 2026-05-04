import { ProjectResponseDTO } from "src/application/dtos";
import { AiRiskClassification } from "../../../domain/enums/aiRiskClassification.enum";
import { HighRiskRole } from "../../../domain/enums/highRiskRole.enum";
import { ProjectModel } from "../../../domain/models/Common/project/project.model";
import {
  mapCreateProjectFormToDTO,
  mapHighRiskRole,
  mapProjectResponseDTOsToModels,
  mapProjectResponseDTOsToProjects,
  mapProjectResponseDTOToModel,
  mapProjectResponseDTOToProject,
  mapRiskClassification,
} from "../project.mapper";
import {
  ProjectDtoToModelBuilder,
  ProjectDtoToProjectBuilder,
  ProjectFromBuilder,
} from "./mocks/project.mappers.mocks";

describe("Test project mappers functions", () => {
  describe("mapRiskClassification", () => {
    it("should receive a valid number and return the mapped value", () => {
      let result = mapRiskClassification(0);
      expect(result).toBe(AiRiskClassification.PROHIBITED);
      result = mapRiskClassification(1);
      expect(result).toBe(AiRiskClassification.HIGH_RISK);
      result = mapRiskClassification(2);
      expect(result).toBe(AiRiskClassification.LIMITED_RISK);
      result = mapRiskClassification(3);
      expect(result).toBe(AiRiskClassification.MINIMAL_RISK);
    });
    it("should receive a valid string and return the mapped value", () => {
      let result = mapRiskClassification("Prohibited");
      expect(result).toBe(AiRiskClassification.PROHIBITED);
      result = mapRiskClassification("High risk");
      expect(result).toBe(AiRiskClassification.HIGH_RISK);
      result = mapRiskClassification("Limited risk");
      expect(result).toBe(AiRiskClassification.LIMITED_RISK);
      result = mapRiskClassification("Minimal risk");
      expect(result).toBe(AiRiskClassification.MINIMAL_RISK);
    });
    it("should receive an invalid number and return the default value", () => {
      const result = mapRiskClassification(99);
      expect(result).toBe(AiRiskClassification.MINIMAL_RISK);
    });
    it("should receive an invalid string and return the default value", () => {
      const result = mapRiskClassification("InvalidString");
      expect(result).toBe(AiRiskClassification.MINIMAL_RISK);
    });
  });
  describe("mapHighRiskRole", () => {
    it("should receive a valid number and return the mapped value", () => {
      let result = mapHighRiskRole(0);
      expect(result).toBe(HighRiskRole.DEPLOYER);
      result = mapHighRiskRole(1);
      expect(result).toBe(HighRiskRole.PROVIDER);
    });
    it("should receive a valid string and return the mapped value", () => {
      let result = mapHighRiskRole("Deployer");
      expect(result).toBe(HighRiskRole.DEPLOYER);
      result = mapHighRiskRole("Provider");
      expect(result).toBe(HighRiskRole.PROVIDER);
    });
    it("should collapse legacy provider-tier strings onto PROVIDER", () => {
      // Pre-reduction values (Distributor/Importer/Product manufacturer/
      // Authorized representative) now map to Provider.
      expect(mapHighRiskRole("Distributor")).toBe(HighRiskRole.PROVIDER);
      expect(mapHighRiskRole("Importer")).toBe(HighRiskRole.PROVIDER);
      expect(mapHighRiskRole("Product Manufacturer")).toBe(HighRiskRole.PROVIDER);
      expect(mapHighRiskRole("Authorized Representative")).toBe(HighRiskRole.PROVIDER);
    });
    it("should collapse legacy 'not_applicable' onto DEPLOYER", () => {
      expect(mapHighRiskRole("not_applicable")).toBe(HighRiskRole.DEPLOYER);
    });
    it("should receive an invalid number and return DEPLOYER (anything but 1)", () => {
      // Implementation: value === 1 ? PROVIDER : DEPLOYER
      const result = mapHighRiskRole(99);
      expect(result).toBe(HighRiskRole.DEPLOYER);
    });
    it("should receive an invalid string and return PROVIDER (non-matching fallback)", () => {
      // Implementation: only "deployer" or "not_applicable" map to DEPLOYER;
      // any other string (including unknown inputs) collapses onto PROVIDER.
      const result = mapHighRiskRole("InvalidString");
      expect(result).toBe(HighRiskRole.PROVIDER);
    });
  });
  describe("mapProjectResponseDTOToProject", () => {
    it("should receive a valid ProjectResponseDTO and return the mapped Project", () => {
      const dto = new ProjectDtoToProjectBuilder().build();
      const project = mapProjectResponseDTOToProject(dto as ProjectResponseDTO);
      expect(project.id).toBe(dto.id);
      expect(project.uc_id).toBe(dto.uc_id);
      expect(project.project_title).toBe(dto.project_title);
      expect(project.owner).toBe(dto.owner);
      expect(project.members).toEqual(dto.members);
      expect(project.start_date.toISOString()).toBe(
        new Date(dto.start_date as string).toISOString(),
      );
      expect(project.ai_risk_classification).toBe(AiRiskClassification.LIMITED_RISK);
      expect(project.type_of_high_risk_role).toBe(HighRiskRole.PROVIDER);
      expect(project.goal).toBe(dto.goal);
      expect(project.last_updated.toISOString()).toBe(
        new Date(dto.last_updated as string).toISOString(),
      );
      expect(project.last_updated_by).toBe(dto.last_updated_by);
      expect(project.framework).toEqual(dto.framework);
      expect(project.monitored_regulations_and_standards).toEqual(
        dto.monitored_regulations_and_standards?.map(String),
      );
      expect(project.geography).toBe(dto.geography);
      expect(project.target_industry).toBe(dto.target_industry);
      expect(project.description).toBe(dto.description);
      expect(project.is_organizational).toBe(dto.is_organizational);
      expect(project.status).toBe(dto.status);
      expect(project.doneSubcontrols).toBe(dto.doneSubcontrols);
      expect(project.totalSubcontrols).toBe(dto.totalSubcontrols);
      expect(project.answeredAssessments).toBe(dto.answeredAssessments);
      expect(project.totalAssessments).toBe(dto.totalAssessments);
    });
    it("should handle missing members by returning an empty array", () => {
      const dto = new ProjectDtoToProjectBuilder().withNoMembers().build();
      const project = mapProjectResponseDTOToProject(dto as ProjectResponseDTO);
      expect(project.members).toEqual([]);
    });
    it("should handle members as numbers by converting them to strings", () => {
      const dto = new ProjectDtoToProjectBuilder().withNumberMembers().build();
      const project = mapProjectResponseDTOToProject(dto as ProjectResponseDTO);
      expect(project.members).toEqual(["1", "2", "3"]);
    });
    it("should return an empty array when framework is undefined", () => {
      const dto = new ProjectDtoToProjectBuilder().withNoFramework().build();
      const project = mapProjectResponseDTOToProject(dto as ProjectResponseDTO);
      expect(project.framework).toEqual([]);
    });
    it("should return an empty array when monitored_regulations_and_standards is undefined", () => {
      const dto = new ProjectDtoToProjectBuilder().withNoMonitoredRegulations().build();
      const project = mapProjectResponseDTOToProject(dto as ProjectResponseDTO);
      expect(project.monitored_regulations_and_standards).toEqual([]);
    });
    it("should convert monitored_regulations_and_standards numbers to strings", () => {
      const dto = new ProjectDtoToProjectBuilder().withNumberMonitoredRegulations().build();
      const project = mapProjectResponseDTOToProject(dto as ProjectResponseDTO);
      expect(project.monitored_regulations_and_standards).toEqual(["101", "202"]);
    });
  });
  describe("mapProjectResponseDTOToModel", () => {
    it("should receive a valid ProjectResponseDTO and return the mapped ProjectModel", () => {
      const dto = new ProjectDtoToModelBuilder().build();
      const projectModel = mapProjectResponseDTOToModel(dto);
      expect(projectModel).toBeInstanceOf(ProjectModel);
      expect(projectModel.id).toBe(dto.id);
      expect(projectModel.uc_id).toBe(dto.uc_id);
      expect(projectModel.project_title).toBe(dto.project_title);
      expect(projectModel.owner).toBe(dto.owner);
      expect(projectModel.start_date).toStrictEqual(new Date(dto.start_date));
      expect(projectModel.ai_risk_classification).toBe(AiRiskClassification.LIMITED_RISK);
      expect(projectModel.type_of_high_risk_role).toBe(HighRiskRole.PROVIDER);
      expect(projectModel.goal).toBe(dto.goal);
      expect(projectModel.last_updated).toStrictEqual(new Date(dto.last_updated));
      expect(projectModel.last_updated_by).toBe(dto.last_updated_by);
      expect(projectModel.is_demo).toBe(dto.is_demo);
      expect(projectModel.created_at).toStrictEqual(new Date(dto.created_at as string));
      expect(projectModel.is_organizational).toBe(dto.is_organizational);
    });
    it("should handle missing created_at by setting it to undefined", () => {
      const dto = new ProjectDtoToModelBuilder().withoutCreatedAt().build();
      const projectModel = mapProjectResponseDTOToModel(dto);
      expect(projectModel.created_at).toBeUndefined();
    });
    it("should set is_organizational to false if undefined in DTO", () => {
      const dto = new ProjectDtoToModelBuilder().withoutIsOrganizational().build();
      const projectModel = mapProjectResponseDTOToModel(dto);
      expect(projectModel.is_organizational).toBe(false);
    });
  });
  describe("mapProjectResponseDTOsToProjects", () => {
    it("should receive an array of ProjectResponseDTOs and return the mapped Projects array", () => {
      const dto1 = new ProjectDtoToProjectBuilder(1).build() as ProjectResponseDTO;
      const dto2 = new ProjectDtoToProjectBuilder(2).build() as ProjectResponseDTO;
      const projects = mapProjectResponseDTOsToProjects([dto1, dto2]);
      expect(projects.length).toBe(2);
      expect(projects[0].id).toBe(dto1.id);
      expect(projects[1].id).toBe(dto2.id);
    });
  });
  describe("mapProjectResponseDTOsToModels", () => {
    it("should receive an array of ProjectResponseDTOs and return the mapped ProjectModels array", () => {
      const dto1 = new ProjectDtoToModelBuilder(1).build();
      const dto2 = new ProjectDtoToModelBuilder(2).build();
      const projectModels = mapProjectResponseDTOsToModels([dto1, dto2]);
      expect(projectModels.length).toBe(2);
      expect(projectModels[0]).toBeInstanceOf(ProjectModel);
      expect(projectModels[0].id).toBe(dto1.id);
      expect(projectModels[1]).toBeInstanceOf(ProjectModel);
      expect(projectModels[1].id).toBe(dto2.id);
    });
  });
  describe("mapCreateProjectFormToDTO", () => {
    it("should receive valid set of form values and return the correct DTO", () => {
      const form = new ProjectFromBuilder().build();
      const result = mapCreateProjectFormToDTO(form);
      expect(result.project_title).toBe(form.project_title);
      expect(result.owner).toBe(form.owner);
      expect(result.members.length).toBe(form.members.length);
      form.members.forEach((member, index) => {
        expect(result.members[index]._id).toBe(member._id);
        expect(result.members[index].name).toBe(member.name);
        expect(result.members[index].surname).toBe(member.surname);
        expect(result.members[index].email).toBe(member.email);
      });
      expect(result.start_date).toBe(form.start_date);
      expect(result.ai_risk_classification).toBe(form.ai_risk_classification);
      expect(result.type_of_high_risk_role).toBe(form.type_of_high_risk_role);
      expect(result.goal).toBe(form.goal);
    });
  });
});
