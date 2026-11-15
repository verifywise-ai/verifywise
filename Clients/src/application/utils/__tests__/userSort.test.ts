import { buildUserSortNames, compareNames, userSortName } from "../userSort";

const users = [
  { id: 1, name: "bea", surname: "Zed" },
  { id: 2, name: "Adam", surname: "Young" },
];

const names = buildUserSortNames(users);

describe("buildUserSortNames", () => {
  it("builds one entry per user and tolerates missing name parts", () => {
    const map = buildUserSortNames([...users, { id: 3, name: null, surname: "Solo" }]);
    expect(map.size).toBe(3);
    expect(map.get("3")).toBe("Solo");
  });
});

describe("userSortName", () => {
  it("joins name and surname", () => {
    expect(userSortName(names, 2)).toBe("Adam Young");
  });

  it("matches ids across number and string", () => {
    expect(userSortName(names, "1")).toBe("bea Zed");
  });

  it("falls back to an empty string for unknown or missing users", () => {
    expect(userSortName(names, 99)).toBe("");
    expect(userSortName(names, null)).toBe("");
    expect(userSortName(names, undefined)).toBe("");
  });
});

describe("compareNames", () => {
  it("ignores case", () => {
    expect(["bea Zed", "Adam Young"].sort(compareNames)).toEqual(["Adam Young", "bea Zed"]);
  });
});
