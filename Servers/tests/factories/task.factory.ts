export type TaskData = {
  id: number;
  title: string;
};

export function buildTask(overrides?: Partial<TaskData>): TaskData {
  return {
    id: overrides?.id ?? 1,
    title: "T1",
    ...overrides,
  };
}

export function buildManyTask(count: number, overrides?: Partial<TaskData>): TaskData[] {
  return Array.from({ length: count }, (_, i) =>
    buildTask({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
