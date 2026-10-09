import { formatUserName, getAvatarName } from "../agentLabels";

const usersMap = { "1": "Ada Lovelace" };
const t = (key: string) => key;

describe("formatUserName", () => {
  it("names a user id found in the users list", () => {
    expect(formatUserName(1, usersMap, t)).toBe("Ada Lovelace");
    expect(formatUserName("1", usersMap, t)).toBe("Ada Lovelace");
  });

  it("falls back to User #id for a numeric id not in the list", () => {
    expect(formatUserName("7", usersMap, t)).toBe("User #7");
  });

  it("shows a non-numeric value (a source-reported owner) as is", () => {
    expect(formatUserName("alice@contoso.com", usersMap, t)).toBe("alice@contoso.com");
    expect(formatUserName("svc-reporting", usersMap, t)).toBe("svc-reporting");
  });
});

describe("getAvatarName", () => {
  it("splits a known user's name for initials", () => {
    expect(getAvatarName("1", usersMap)).toEqual({ firstname: "Ada", lastname: "Lovelace" });
  });

  it("uses a source-reported value for its initial", () => {
    expect(getAvatarName("alice@contoso.com", usersMap)).toEqual({
      firstname: "alice@contoso.com",
      lastname: "",
    });
  });

  it("gives no initials for an unknown numeric id, so the avatar shows ?", () => {
    expect(getAvatarName("7", usersMap)).toEqual({ firstname: "", lastname: "" });
  });
});
