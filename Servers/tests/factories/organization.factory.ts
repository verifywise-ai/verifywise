export type OrganizationData = {
  id: number;
  name: string;
};

export function buildOrganization(overrides?: Partial<OrganizationData>): OrganizationData {
  return {
    id: overrides?.id ?? 1,
    name: "Org1",
    ...overrides,
  };
}

export function buildManyOrganization(
  count: number,
  overrides?: Partial<OrganizationData>,
): OrganizationData[] {
  return Array.from({ length: count }, (_, i) =>
    buildOrganization({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
