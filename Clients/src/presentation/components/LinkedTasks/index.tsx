import { FC, useMemo } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router";
import Chip from "../Chip";
import useUsers from "../../../application/hooks/useUsers";
import { useLinkedTasks } from "../../../application/hooks/useTasks";
import type { EntityLinkType, ITask } from "../../../domain/interfaces/i.task";
import { TaskStatus } from "../../../domain/enums/task.enum";
import { formatDate } from "../../tools/isoDateToString";
import { background, border, radiusPx, text } from "../../themes/palette";

interface LinkedTasksProps {
  /** The entity the tasks are linked to (task_entity_links). */
  entityType: EntityLinkType;
  entityId: number;
  /** Shown when no task the user can see is linked. */
  emptyMessage: string;
}

/** Task statuses as the tasks page shows them (sentence case). */
const STATUS_LABEL: Record<string, string> = {
  [TaskStatus.OPEN]: "Open",
  [TaskStatus.IN_PROGRESS]: "In progress",
  [TaskStatus.COMPLETED]: "Completed",
  [TaskStatus.OVERDUE]: "Overdue",
};

const rowSx = {
  "display": "flex",
  "alignItems": "center",
  "justifyContent": "space-between",
  "gap": "12px",
  "width": "100%",
  "padding": "8px 12px",
  "border": `1px solid ${border.light}`,
  "borderRadius": radiusPx.sm,
  "backgroundColor": background.main,
  "cursor": "pointer",
  "textAlign": "left",
  "font": "inherit",
  "&:hover": { backgroundColor: background.hover },
  "&:focus-visible": { outline: `2px solid ${border.dark}`, outlineOffset: "1px" },
} as const;

/**
 * Read-only list of the tasks linked to one entity that the user can see
 * (title, status, assignees and due date). Clicking a task opens it on the
 * tasks page.
 */
const LinkedTasks: FC<LinkedTasksProps> = ({ entityType, entityId, emptyMessage }) => {
  const navigate = useNavigate();
  const { data: tasks = [], isLoading, isError } = useLinkedTasks(entityType, entityId);
  const { users } = useUsers();

  const userNames = useMemo(
    () => new Map(users.map((user) => [user.id, `${user.name} ${user.surname}`.trim()])),
    [users],
  );

  // GET /tasks sends assignees as user ids; the type also allows objects.
  const assigneeNames = (task: ITask): string =>
    ((task.assignees ?? []) as Array<number | { user_id: number }>)
      .map((assignee) =>
        userNames.get(Number(typeof assignee === "object" ? assignee.user_id : assignee)),
      )
      .filter((name): name is string => !!name)
      .join(", ");

  if (isLoading) {
    return <Typography sx={{ fontSize: 13, color: text.tertiary }}>Loading...</Typography>;
  }

  if (isError) {
    return (
      <Typography sx={{ fontSize: 13, color: text.tertiary }}>
        Could not load the linked tasks.
      </Typography>
    );
  }

  if (tasks.length === 0) {
    return <Typography sx={{ fontSize: 13, color: text.tertiary }}>{emptyMessage}</Typography>;
  }

  return (
    <Stack component="ul" gap="8px" sx={{ listStyle: "none", m: 0, p: 0 }}>
      {tasks.map((task) => {
        const assignees = assigneeNames(task);
        return (
          <li key={task.id}>
            <Box
              component="button"
              type="button"
              data-testid={`linked-task-${task.id}`}
              onClick={() => navigate(`/tasks?taskId=${task.id}`)}
              sx={rowSx}
            >
              <Stack gap="2px" minWidth={0}>
                <Typography
                  data-vw-no-translate="true"
                  sx={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: text.primary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {task.title}
                </Typography>
                <Stack direction="row" gap="8px" flexWrap="wrap">
                  <Typography
                    component="span"
                    sx={{ fontSize: 12, color: text.tertiary }}
                    data-vw-no-translate={assignees ? "true" : undefined}
                  >
                    {assignees || "Unassigned"}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: 12, color: text.tertiary }}>
                    {task.due_date ? formatDate(task.due_date) : "No due date"}
                  </Typography>
                </Stack>
              </Stack>
              <Chip label={STATUS_LABEL[task.status] ?? task.status} />
            </Box>
          </li>
        );
      })}
    </Stack>
  );
};

export default LinkedTasks;
