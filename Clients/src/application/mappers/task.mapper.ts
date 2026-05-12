/**
 * Task Mapper
 *
 * Maps between Task DTOs (API layer) and Task domain models.
 * Handles data transformation, type conversion, and validation.
 */

import { TaskModel, TaskAssigneeModel } from "../../domain/models/Common/task/task.model";
import { ITask, ITaskAssignee } from "../../domain/interfaces/i.task";
import { TaskResponseDTO, TaskAssigneeDTO, CreateTaskDTO, UpdateTaskDTO } from "../dtos/task.dto";
import { TaskPriority, TaskStatus } from "../../domain/enums/task.enum";

/**
 * Converts string priority to TaskPriority enum
 */
export function mapPriority(priority: string): TaskPriority {
  const mapping: Record<string, TaskPriority> = {
    low: TaskPriority.LOW,
    medium: TaskPriority.MEDIUM,
    high: TaskPriority.HIGH,
  };
  return mapping[priority] || TaskPriority.MEDIUM;
}

/**
 * Converts string status to TaskStatus enum
 */
export function mapStatus(status: string): TaskStatus {
  const mapping: Record<string, TaskStatus> = {
    "open": TaskStatus.OPEN,
    "in progress": TaskStatus.IN_PROGRESS,
    "completed": TaskStatus.COMPLETED,
    "overdue": TaskStatus.OVERDUE,
    "deleted": TaskStatus.DELETED,
  };
  return mapping[status] || TaskStatus.OPEN;
}

/**
 * Maps a TaskAssigneeDTO to ITaskAssignee
 *
 * @param dto - Task assignee DTO from API
 * @returns ITaskAssignee
 */
export function mapTaskAssigneeDTOToInterface(dto: TaskAssigneeDTO): ITaskAssignee {
  return {
    user_id: dto.user_id,
    user_name: dto.user_name,
    user_avatar: dto.user_avatar,
    assigned_at: dto.assigned_at ? new Date(dto.assigned_at) : undefined,
  };
}

/**
 * Maps a TaskAssigneeDTO to TaskAssigneeModel
 *
 * @param dto - Task assignee DTO from API
 * @returns TaskAssigneeModel instance
 */
export function mapTaskAssigneeDTOToModel(dto: TaskAssigneeDTO): TaskAssigneeModel {
  return new TaskAssigneeModel({
    user_id: dto.user_id,
    user_name: dto.user_name,
    user_avatar: dto.user_avatar,
    assigned_at: dto.assigned_at ? new Date(dto.assigned_at) : undefined,
  });
}

/**
 * Maps a TaskResponseDTO to ITask
 *
 * @param dto - Task response DTO from API
 * @returns ITask
 */
export function mapTaskResponseDTOToInterface(dto: TaskResponseDTO): ITask {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    creator_id: dto.creator_id,
    organization_id: dto.organization_id,
    due_date: dto.due_date ? new Date(dto.due_date) : undefined,
    priority: mapPriority(dto.priority),
    status: mapStatus(dto.status),
    categories: dto.categories || [],
    created_at: dto.created_at ? new Date(dto.created_at) : undefined,
    updated_at: dto.updated_at ? new Date(dto.updated_at) : undefined,
    creator_name: dto.creator_name,
    assignees: dto.assignees?.map(mapTaskAssigneeDTOToInterface),
    isOverdue: dto.isOverdue,
  };
}

/**
 * Maps a TaskResponseDTO to TaskModel
 *
 * @param dto - Task response DTO from API
 * @returns TaskModel instance
 */
export function mapTaskResponseDTOToModel(dto: TaskResponseDTO): TaskModel {
  const taskData: Partial<ITask> = {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    creator_id: dto.creator_id,
    organization_id: dto.organization_id,
    due_date: dto.due_date ? new Date(dto.due_date) : undefined,
    priority: mapPriority(dto.priority),
    status: mapStatus(dto.status),
    categories: dto.categories || [],
    created_at: dto.created_at ? new Date(dto.created_at) : undefined,
    updated_at: dto.updated_at ? new Date(dto.updated_at) : undefined,
    creator_name: dto.creator_name,
    assignees: dto.assignees?.map(mapTaskAssigneeDTOToInterface),
    isOverdue: dto.isOverdue,
  };

  return new TaskModel(taskData);
}

/**
 * Maps an array of TaskResponseDTOs to ITask interfaces
 *
 * @param dtos - Array of task response DTOs
 * @returns Array of ITask interfaces
 */
export function mapTaskResponseDTOsToInterfaces(dtos: TaskResponseDTO[]): ITask[] {
  return dtos.map(mapTaskResponseDTOToInterface);
}

/**
 * Maps an array of TaskResponseDTOs to TaskModel instances
 *
 * @param dtos - Array of task response DTOs
 * @returns Array of TaskModel instances
 */
export function mapTaskResponseDTOsToModels(dtos: TaskResponseDTO[]): TaskModel[] {
  return dtos.map(mapTaskResponseDTOToModel);
}

/**
 * Maps ITask to CreateTaskDTO
 *
 * @param task - Task interface
 * @returns CreateTaskDTO
 */
export function mapTaskToCreateDTO(task: Partial<ITask>): CreateTaskDTO {
  return {
    title: task.title || "",
    description: task.description,
    creator_id: task.creator_id || 0,
    organization_id: task.organization_id,
    due_date: task.due_date?.toISOString(),
    priority: task.priority || TaskPriority.MEDIUM,
    status: task.status || TaskStatus.OPEN,
    categories: task.categories,
    assignees: task.assignees?.map((a) => a.user_id),
  };
}

/**
 * Maps ITask to UpdateTaskDTO
 *
 * @param task - Task interface with fields to update
 * @returns UpdateTaskDTO
 */
export function mapTaskToUpdateDTO(task: Partial<ITask>): UpdateTaskDTO {
  return {
    title: task.title,
    description: task.description,
    due_date: task.due_date?.toISOString(),
    priority: task.priority,
    status: task.status,
    categories: task.categories,
    assignees: task.assignees?.map((a) => a.user_id),
  };
}
