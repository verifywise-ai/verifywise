export type VendorData = {
  id: number;
  vendor_name: string;
};

export function buildVendor(overrides?: Partial<VendorData>): VendorData {
  return {
    id: overrides?.id ?? 1,
    vendor_name: "Acme AI",
    ...overrides,
  };
}

export function buildManyVendor(count: number, overrides?: Partial<VendorData>): VendorData[] {
  return Array.from({ length: count }, (_, i) =>
    buildVendor({ ...overrides, id: overrides?.id ?? i + 1 }),
  );
}
