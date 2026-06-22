export type ProjectData = {
  id: number;
  project_title: string;
};

export function buildProject(overrides?: Partial<ProjectData>): ProjectData {
  return {
    id: overrides?.id ?? 1,
    project_title: "P1",
    ...overrides,
  };
}

export function buildManyProject(count: number, overrides?: Partial<ProjectData>): ProjectData[] {
  return Array.from({ length: count }, (_, i) =>
    buildProject({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
