import { TaskPriority, TaskStatus } from "../../../domain/enums/task.enum";
import { TaskAssigneeModel, TaskModel } from "../../../domain/models/Common/task/task.model";
import * as task from "../task.mapper";
import { ITaskBuilder, TaskAssigneeBuilder, TaskResponseBuilder } from "./mocks/task.mappers.mocks";

const {
  mapPriority,
  mapStatus,
  mapTaskAssigneeDTOToInterface,
  mapTaskAssigneeDTOToModel,
  mapTaskResponseDTOToInterface,
} = task;

describe("Test task mappers functions", () => {
  describe("mapPriority", () => {
    it("should map priority string to Priority enum", () => {
      expect(mapPriority("low")).toBe(TaskPriority.LOW);
      expect(mapPriority("medium")).toBe(TaskPriority.MEDIUM);
      expect(mapPriority("high")).toBe(TaskPriority.HIGH);
    });
    it("should return MEDIUM for unknown priority", () => {
      expect(mapPriority("")).toBe(TaskPriority.MEDIUM);
    });
  });
  describe("mapStatus", () => {
    it("should map status string to Status enum", () => {
      expect(mapStatus("open")).toBe(TaskStatus.OPEN);
      expect(mapStatus("in progress")).toBe(TaskStatus.IN_PROGRESS);
      expect(mapStatus("completed")).toBe(TaskStatus.COMPLETED);
      expect(mapStatus("overdue")).toBe(TaskStatus.OVERDUE);
      expect(mapStatus("deleted")).toBe(TaskStatus.DELETED);
    });
    it("should return OPEN for unknown status", () => {
      expect(mapStatus("")).toBe(TaskStatus.OPEN);
    });
  });
  describe("mapTaskAssigneeDTOToInterface", () => {
    it("should receive a TaskAssigneeDTO and return an ITaskAssignee", () => {
      const dto = new TaskAssigneeBuilder().build();
      const result = mapTaskAssigneeDTOToInterface(dto);
      expect(result.user_id).toBe(dto.user_id);
      expect(result.user_name).toBe(dto.user_name);
      expect(result.user_avatar).toBe(dto.user_avatar);
      expect(result.assigned_at).toStrictEqual(new Date(dto.assigned_at!));
    });
    it("should convert assigned_at to Date object", () => {
      const dto = new TaskAssigneeBuilder().build();
      const result = mapTaskAssigneeDTOToInterface(dto);
      expect(result.assigned_at).toBeInstanceOf(Date);
    });
    it("should return undefined for assigned_at if not present in DTO", () => {
      const dto = new TaskAssigneeBuilder().withoutAssignedAt().build();
      const result = mapTaskAssigneeDTOToInterface(dto);
      expect(result.assigned_at).toBeUndefined();
    });
  });
  describe("mapTaskAssigneeDTOToModel", () => {
    it("should receive a TaskAssigneeDTO and return a TaskAssigneeModel instance", () => {
      const dto = new TaskAssigneeBuilder().build();
      const result = mapTaskAssigneeDTOToModel(dto);
      expect(result).toBeInstanceOf(TaskAssigneeModel);
      expect(result.user_id).toBe(dto.user_id);
      expect(result.user_name).toBe(dto.user_name);
      expect(result.user_avatar).toBe(dto.user_avatar);
      expect(result.assigned_at).toStrictEqual(new Date(dto.assigned_at!));
    });
    it("should convert assigned_at to Date object", () => {
      const dto = new TaskAssigneeBuilder().build();
      const result = mapTaskAssigneeDTOToModel(dto);
      expect(result.assigned_at).toBeInstanceOf(Date);
    });
    it("should set default assigned_at when not present in DTO", () => {
      const dto = new TaskAssigneeBuilder().withoutAssignedAt().build();
      const result = mapTaskAssigneeDTOToModel(dto);
      expect(result.assigned_at).not.toBeUndefined();
    });
  });
  describe("mapTaskResponseDTOToInterface", () => {
    it("should receive a TaskResponseDTO and return an ITask", () => {
      const dto = new TaskResponseBuilder().build();
      const result = mapTaskResponseDTOToInterface(dto);
      expect(result.id).toBe(dto.id);
      expect(result.title).toBe(dto.title);
      expect(result.description).toBe(dto.description);
      expect(result.creator_id).toBe(dto.creator_id);
      expect(result.organization_id).toBe(dto.organization_id);
      expect(result.due_date).toStrictEqual(new Date(dto.due_date as string));
      expect(result.priority).toBe(mapPriority(dto.priority));
      expect(result.status).toBe(mapStatus(dto.status));
      expect(result.categories).toBe(dto.categories);
      expect(result.created_at).toStrictEqual(new Date(dto.created_at as string));
      expect(result.updated_at).toStrictEqual(new Date(dto.updated_at as string));
      expect(result.creator_name).toBe(dto.creator_name);
      expect(result.assignees?.length).toBe(dto.assignees?.length);
      dto.assignees?.forEach((assigneeDto, index) => {
        const assignee = result.assignees![index];
        expect(assignee.user_id).toBe(assigneeDto.user_id);
        expect(assignee.user_name).toBe(assigneeDto.user_name);
        expect(assignee.user_avatar).toBe(assigneeDto.user_avatar);
        expect(assignee.assigned_at).toStrictEqual(new Date(assigneeDto.assigned_at as string));
      });
      expect(result.isOverdue).toBe(dto.isOverdue);
    });
    it("should return undefined for due_date if not present in DTO", () => {
      const dto = new TaskResponseBuilder().withoutDueDate().build();
      const result = mapTaskResponseDTOToInterface(dto);
      expect(result.due_date).toBeUndefined();
    });
    it("should return an empty array for categories if not present in DTO", () => {
      const dto = new TaskResponseBuilder().withoutCategories().build();
      const result = mapTaskResponseDTOToInterface(dto);
      expect(result.categories).toEqual([]);
    });
    it("should return undefined for created_at if not present in DTO", () => {
      const dto = new TaskResponseBuilder().withoutCreatedAt().build();
      const result = mapTaskResponseDTOToInterface(dto);
      expect(result.created_at).toBeUndefined();
    });
    it("should return undefined for updated_at if not present in DTO", () => {
      const dto = new TaskResponseBuilder().withoutUpdatedAt().build();
      const result = mapTaskResponseDTOToInterface(dto);
      expect(result.updated_at).toBeUndefined();
    });
  });
  describe("mapTaskResponseDTOToModel", () => {
    it("should receive a TaskResponseDTO and return a TaskModel instance", () => {
      const dto = new TaskResponseBuilder().build();
      const result = task.mapTaskResponseDTOToModel(dto);
      expect(result).toBeInstanceOf(TaskModel);
      expect(result.id).toBe(dto.id);
      expect(result.title).toBe(dto.title);
      expect(result.description).toBe(dto.description);
      expect(result.creator_id).toBe(dto.creator_id);
      expect(result.organization_id).toBe(dto.organization_id);
      expect(result.due_date).toStrictEqual(new Date(dto.due_date as string));
      expect(result.priority).toBe(mapPriority(dto.priority));
      expect(result.status).toBe(mapStatus(dto.status));
      expect(result.categories).toBe(dto.categories);
      expect(result.created_at).toStrictEqual(new Date(dto.created_at as string));
      expect(result.updated_at).toStrictEqual(new Date(dto.updated_at as string));
      expect(result.creator_name).toBe(dto.creator_name);
      expect(result.assignees?.length).toBe(dto.assignees?.length);
      dto.assignees?.forEach((assigneeDto, index) => {
        const assignee = result.assignees![index];
        expect(assignee.user_id).toBe(assigneeDto.user_id);
        expect(assignee.user_name).toBe(assigneeDto.user_name);
        expect(assignee.user_avatar).toBe(assigneeDto.user_avatar);
        expect(assignee.assigned_at).toStrictEqual(new Date(assigneeDto.assigned_at as string));
      });
      expect(result.isOverdue).toBe(dto.isOverdue);
    });
    it("should return undefined for due_date if not present in DTO", () => {
      const dto = new TaskResponseBuilder().withoutDueDate().build();
      const result = task.mapTaskResponseDTOToModel(dto);
      expect(result.due_date).toBeUndefined();
    });
    it("should return an empty array for categories if not present in DTO", () => {
      const dto = new TaskResponseBuilder().withoutCategories().build();
      const result = task.mapTaskResponseDTOToModel(dto);
      expect(result.categories).toEqual([]);
    });
    it("should set default created_at when not present in DTO", () => {
      const dto = new TaskResponseBuilder().withoutCreatedAt().build();
      const result = task.mapTaskResponseDTOToModel(dto);
      expect(result.created_at).not.toBeUndefined();
    });
    it("should set default updated_at when not present in DTO", () => {
      const dto = new TaskResponseBuilder().withoutUpdatedAt().build();
      const result = task.mapTaskResponseDTOToModel(dto);
      expect(result.updated_at).not.toBeUndefined();
    });
  });
  describe("mapTaskResponseDTOsToInterfaces", () => {
    it("should receive an array of TaskResponseDTO and return an array of ITask", () => {
      const dto1 = new TaskResponseBuilder(1).build();
      const dto2 = new TaskResponseBuilder(2).build();
      const results = task.mapTaskResponseDTOsToInterfaces([dto1, dto2]);
      expect(results.length).toBe(2);
      expect(results[0].id).toBe(dto1.id);
      expect(results[1].id).toBe(dto2.id);
    });
  });
  describe("mapTaskResponseDTOsToModels", () => {
    it("should receive an array of TaskResponseDTO and return an array of TaskModel instances", () => {
      const dto1 = new TaskResponseBuilder(1).build();
      const dto2 = new TaskResponseBuilder(2).build();
      const results = task.mapTaskResponseDTOsToModels([dto1, dto2]);
      expect(results.length).toBe(2);
      expect(results[0]).toBeInstanceOf(TaskModel);
      expect(results[1]).toBeInstanceOf(TaskModel);
      expect(results[0].id).toBe(dto1.id);
      expect(results[1].id).toBe(dto2.id);
    });
  });
  describe("mapTaskToCreateDTO", () => {
    it("should receive an ITask and return a CreateTaskDTO", () => {
      const taskModel = new ITaskBuilder().build();
      const result = task.mapTaskToCreateDTO(taskModel);
      expect(result.title).toBe(taskModel.title);
      expect(result.description).toBe(taskModel.description);
      expect(result.creator_id).toBe(taskModel.creator_id);
      expect(result.due_date).toBe(taskModel.due_date?.toISOString());
      expect(result.priority).toBe(taskModel.priority);
      expect(result.status).toBe(taskModel.status);
      expect(result.categories).toBe(taskModel.categories);
      expect(result.assignees).toHaveLength(taskModel.assignees?.length as number);
    });
    it("should return an empty string for title if it is undefined", () => {
      const taskModel = new ITaskBuilder().withoutTitle().build();
      const result = task.mapTaskToCreateDTO(taskModel);
      expect(result.title).toBe("");
    });
    it("should return 0 for creator_id if it is undefined", () => {
      const taskModel = new ITaskBuilder().withoutCreatorId().build();
      const result = task.mapTaskToCreateDTO(taskModel);
      expect(result.creator_id).toBe(0);
    });
    it("should return task priority medium if priority is undefined", () => {
      const taskModel = new ITaskBuilder().withoutPriority().build();
      const result = task.mapTaskToCreateDTO(taskModel);
      expect(result.priority).toBe(TaskPriority.MEDIUM);
    });
    it("should return task status open if status is undefined", () => {
      const taskModel = new ITaskBuilder().withoutStatus().build();
      const result = task.mapTaskToCreateDTO(taskModel);
      expect(result.status).toBe(TaskStatus.OPEN);
    });
    it("should return an array of ids for the assignees", () => {
      const taskModel = new ITaskBuilder().build();
      const result = task.mapTaskToCreateDTO(taskModel);
      expect(result.assignees).toHaveLength(taskModel.assignees?.length as number);
      taskModel.assignees?.forEach((assignee, index) => {
        expect(result.assignees![index]).toBe(assignee.user_id);
      });
    });
  });
  describe("mapTaskToUpdateDTO", () => {
    it("should receive an ITask and return an UpdateTaskDTO", () => {
      const taskModel = new ITaskBuilder().build();
      const result = task.mapTaskToUpdateDTO(taskModel);
      expect(result.title).toBe(taskModel.title);
      expect(result.description).toBe(taskModel.description);
      expect(result.due_date).toBe(taskModel.due_date?.toISOString());
      expect(result.priority).toBe(taskModel.priority);
      expect(result.status).toBe(taskModel.status);
      expect(result.categories).toBe(taskModel.categories);
      expect(result.assignees).toHaveLength(taskModel.assignees?.length as number);
    });
    it("should return an array of ids for the assignees", () => {
      const taskModel = new ITaskBuilder().build();
      const result = task.mapTaskToUpdateDTO(taskModel);
      expect(result.assignees).toHaveLength(taskModel.assignees?.length as number);
      taskModel.assignees?.forEach((assignee, index) => {
        expect(result.assignees![index]).toBe(assignee.user_id);
      });
    });
  });
});
