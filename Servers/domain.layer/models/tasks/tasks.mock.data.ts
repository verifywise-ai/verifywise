import { TaskPriority } from "../../enums/task-priority.enum";
import { TaskStatus } from "../../enums/task-status.enum";
import { ITask } from "../../interfaces/i.task";

// Sample mock data for Tasks
const mockTasks = (user1: number, user2: number): ITask[] => {
  return [
    {
      id: 1,
      title: "Review AI compliance documentation",
      description: "Review and update the AI compliance documentation for the Q1 audit",
      creator_id: user1,
      due_date: new Date("2025-01-15"),
      priority: TaskPriority.HIGH,
      status: TaskStatus.OPEN,
      categories: ["compliance", "documentation"],
      created_at: new Date("2025-01-05"),
      updated_at: new Date("2025-01-05"),
    },
    {
      id: 2,
      title: "Update risk assessment framework",
      description: "Implement the new risk assessment criteria based on EU AI Act requirements",
      creator_id: user2,
      due_date: new Date("2025-02-01"),
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.IN_PROGRESS,
      categories: ["risk-assessment", "eu-ai-act"],
      created_at: new Date("2025-01-10"),
      updated_at: new Date("2025-01-12"),
    },
    {
      id: 3,
      title: "Complete bias testing for ML model",
      description: "Run comprehensive bias testing on the customer recommendation algorithm",
      creator_id: user1,
      due_date: new Date("2025-01-20"),
      priority: TaskPriority.HIGH,
      status: TaskStatus.OVERDUE,
      categories: ["bias-testing", "ml-model"],
      created_at: new Date("2025-01-02"),
      updated_at: new Date("2025-01-02"),
    },
    {
      id: 4,
      title: "Prepare vendor risk assessment report",
      description:
        "Create detailed report on third-party AI vendor risks and mitigation strategies",
      creator_id: user2,
      due_date: new Date("2025-02-15"),
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.COMPLETED,
      categories: ["vendor-risk", "reporting"],
      created_at: new Date("2025-01-08"),
      updated_at: new Date("2025-01-14"),
    },
    {
      id: 5,
      title: "Train team on new compliance procedures",
      description:
        "Organize and conduct training sessions for the development team on updated compliance procedures",
      creator_id: user1,
      due_date: new Date("2025-03-01"),
      priority: TaskPriority.LOW,
      status: TaskStatus.OPEN,
      categories: ["training", "compliance"],
      created_at: new Date("2025-01-15"),
      updated_at: new Date("2025-01-15"),
    },
  ];
};

export { mockTasks };
