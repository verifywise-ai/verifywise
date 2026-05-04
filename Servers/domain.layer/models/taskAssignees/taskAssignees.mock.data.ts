import { ITaskAssignee } from "./taskAssignees.model";

export const taskAssignees = (
  userId1: number,
  userId2: number,
  taskId1: number,
  taskId2: number,
  taskId3: number,
  taskId4: number,
  taskId5: number,
): ITaskAssignee[] => {
  return [
    // Task 1: Assigned to user2
    { task_id: taskId1, user_id: userId2, assigned_at: new Date("2025-01-05") },

    // Task 2: Assigned to user1
    { task_id: taskId2, user_id: userId1, assigned_at: new Date("2025-01-10") },

    // Task 3: Assigned to user2
    { task_id: taskId3, user_id: userId2, assigned_at: new Date("2025-01-02") },

    // Task 4: Assigned to user1
    { task_id: taskId4, user_id: userId1, assigned_at: new Date("2025-01-08") },

    // Task 5: Assigned to multiple users (user2 and user1)
    { task_id: taskId5, user_id: userId2, assigned_at: new Date("2025-01-15") },
    { task_id: taskId5, user_id: userId1, assigned_at: new Date("2025-01-15") },
  ];
};
