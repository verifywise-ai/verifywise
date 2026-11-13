import { useEffect, useState } from "react";
import { getAllTasks } from "../repository/task.repository";
import { TaskStatus } from "../../domain/enums/task.enum";

const REFRESH_MS = 5 * 60 * 1000;

/**
 * Number of open tasks for the sidebar's Tasks entry. Fetched on mount and
 * every five minutes; 0 while loading or when the request fails. Shared by
 * the main sidebar and the unified sidebar.
 */
export function useOpenTasksCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const response = await getAllTasks({ status: [TaskStatus.OPEN] });
        if (!cancelled) setCount(response?.data?.tasks?.length || 0);
      } catch (error) {
        console.error("Error fetching open tasks count:", error);
        if (!cancelled) setCount(0);
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return count;
}
