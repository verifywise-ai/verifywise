import { compareNames, userSortName } from "../userSort";

const users = [
  { id: 1, name: "bea", surname: "Zed" },
  { id: 2, name: "Adam", surname: "Young" },
];

describe("userSortName", () => {
  it("joins name and surname", () => {
    expect(userSortName(users, 2)).toBe("Adam Young");
  });

  it("matches ids across number and string", () => {
    expect(userSortName(users, "1")).toBe("bea Zed");
  });

  it("falls back to an empty string for unknown or missing users", () => {
    expect(userSortName(users, 99)).toBe("");
    expect(userSortName(users, null)).toBe("");
    expect(userSortName(users, undefined)).toBe("");
  });
});

describe("compareNames", () => {
  it("ignores case", () => {
    expect(["bea Zed", "Adam Young"].sort(compareNames)).toEqual(["Adam Young", "bea Zed"]);
  });
});
