import type { ArticleContent } from '../../contentTypes';

export const taskManagementContent: ArticleContent = {
  blocks: [
    {
      type: 'heading',
      id: 'overview',
      level: 2,
      text: 'Overview',
    },
    {
      type: 'paragraph',
      text: 'Task management in VerifyWise helps you coordinate AI governance activities and compliance tasks across your teams. Whether it\'s implementation milestones or audit prep, the task system keeps things visible and accountable.',
    },
    {
      type: 'paragraph',
      text: 'It prevents compliance gaps by making sure nothing falls through the cracks. Each task can be assigned, prioritized and tracked through completion with clear ownership and deadlines.',
    },
    {
      type: 'heading',
      id: 'accessing-tasks',
      level: 2,
      text: 'Accessing task management',
    },
    {
      type: 'paragraph',
      text: 'Go to **Tasks** from the main sidebar. The page shows summary cards with task counts by status, followed by a searchable and filterable table of all tasks.',
    },
    {
      type: 'heading',
      id: 'task-statuses',
      level: 2,
      text: 'Task statuses',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Open', text: 'Task has been created but work has not begun' },
        { bold: 'In progress', text: 'Task is actively being worked on' },
        { bold: 'Completed', text: 'Task has been finished successfully' },
        { bold: 'Overdue', text: 'Task is past its due date and not yet completed' },
        { bold: 'Deleted', text: 'Task has been removed (soft-deleted) and is hidden from default views' },
      ],
    },
    {
      type: 'heading',
      id: 'creating-tasks',
      level: 2,
      text: 'Creating a new task',
    },
    {
      type: 'paragraph',
      text: 'To create a new task, click the **Add task** button. Provide the following information:',
    },
    {
      type: 'ordered-list',
      items: [
        { bold: 'Title', text: ',A clear, descriptive name for the task' },
        { bold: 'Description', text: ',Detailed information about what needs to be done' },
        { bold: 'Assignee', text: ',The team member responsible for completing the task' },
        { bold: 'Priority', text: ',Low, medium, or high priority level' },
        { bold: 'Due date', text: ',When the task should be completed' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      text: 'Link tasks to specific projects to maintain clear relationships between governance activities and your AI initiatives.',
    },
    {
      type: 'heading',
      id: 'managing-tasks',
      level: 2,
      text: 'Managing tasks',
    },
    {
      type: 'paragraph',
      text: 'From the task table, you can:',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Filter tasks', text: 'Use the filter options to view tasks by status, assignee, priority or due date' },
        { bold: 'Search tasks', text: 'Use the search box to find tasks by title or description' },
        { bold: 'Update status', text: 'Change task status as work progresses' },
        { bold: 'Edit details', text: 'Modify task information, reassign, or update deadlines' },
        { bold: 'Archive tasks', text: 'Archive tasks to declutter your list, use "Include archived" to view them later, or restore and delete as needed' },
      ],
    },
    {
      type: 'heading',
      id: 'best-practices',
      level: 2,
      text: 'Best practices',
    },
    {
      type: 'bullet-list',
      items: [
        { bold: 'Clear ownership', text: 'Tasks support multiple assignees (up to 20). When you have several, designate one as the primary owner so accountability is clear' },
        { bold: 'Realistic deadlines', text: 'Set achievable due dates to maintain team morale and trust' },
        { bold: 'Regular reviews', text: 'Review task progress regularly to identify blockers early' },
        { bold: 'Link to projects', text: 'Connect tasks to relevant projects for better traceability' },
      ],
    },
  ],
};
