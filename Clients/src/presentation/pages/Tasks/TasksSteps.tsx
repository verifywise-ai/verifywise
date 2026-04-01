import { CirclePlus, BarChart3, Filter, Search } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const TasksSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="add-task-button"]',
    content: {
      header: "Create new tasks",
      body: "Assign governance and compliance tasks to team members. Set priorities, due dates, and track progress from creation to completion.",
      icon: <CirclePlus size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="task-summary-cards"]',
    content: {
      header: "Task overview",
      body: "Monitor total tasks, overdue items, in-progress work, and completed tasks. Identify bottlenecks and workload distribution at a glance.",
      icon: <BarChart3 size={20} color={background.main} />,
    },
    placement: "bottom",
  },
  {
    target: '[data-joyride-id="task-filters"]',
    content: {
      header: "Filter tasks",
      body: "Filter by status, priority, or assignee to focus on specific subsets of tasks. Combine filters to find exactly what you need.",
      icon: <Filter size={20} color={background.main} />,
    },
    placement: "bottom-start",
  },
  {
    target: '[data-joyride-id="task-search"]',
    content: {
      header: "Search tasks",
      body: "Quickly find tasks by searching titles or descriptions. Perfect for locating specific work items in large task lists.",
      icon: <Search size={20} color={background.main} />,
    },
    placement: "bottom",
  },
];

export default TasksSteps;
