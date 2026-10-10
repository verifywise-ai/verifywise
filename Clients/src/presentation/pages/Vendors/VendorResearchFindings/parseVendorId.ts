/** A vendor id from the URL: digits only, above zero. Anything else means all vendors. */
export function parseVendorId(raw: string | null): number | null {
  if (raw === null || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
