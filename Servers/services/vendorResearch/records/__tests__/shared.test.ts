import { sharedRecordsLookup } from "../index";

describe("sharedRecordsLookup", () => {
  it("is none when the records are turned off", () => {
    expect(sharedRecordsLookup({ records: false })).toBeUndefined();
  });

  it("is one lookup for the whole process when they are on, so that the memory of the answers is shared", () => {
    const first = sharedRecordsLookup({ records: true });

    expect(typeof first).toBe("function");
    expect(sharedRecordsLookup({ records: true })).toBe(first);
  });

  it("with the VRDB on is a lookup of its own, also shared, that leaves the mirrored lists out", () => {
    const withoutVrdb = sharedRecordsLookup({ records: true, vrdb: false });
    const beside = sharedRecordsLookup({ records: true, vrdb: true });

    expect(typeof beside).toBe("function");
    expect(beside).not.toBe(withoutVrdb);
    expect(sharedRecordsLookup({ records: true, vrdb: true })).toBe(beside);
    expect(sharedRecordsLookup({ records: false, vrdb: true })).toBeUndefined();
  });
});
