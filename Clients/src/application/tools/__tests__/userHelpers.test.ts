import { describe, it, expect } from "vitest";
import { getUserForLogging } from "../userHelpers";
import { User } from "../../../domain/types/User";

describe("getUserForLogging", () => {
  it("returns formatted user data", () => {
    const user: User = {
      id: 42,
      name: "John",
      surname: "Doe",
      email: "john@example.com",
    };

    const result = getUserForLogging(user);
    expect(result).toEqual({
      id: "42",
      email: "john@example.com",
      firstname: "John",
      lastname: "Doe",
    });
  });

  it("returns 'N/A' when email is null", () => {
    const user: User = {
      id: 1,
      name: "Jane",
      surname: "Smith",
      email: null as unknown as string,
    };

    const result = getUserForLogging(user);
    expect(result.email).toBe("N/A");
  });

  it("converts numeric id to string", () => {
    const user: User = {
      id: 123,
      name: "Test",
      surname: "User",
      email: "test@test.com",
    };

    const result = getUserForLogging(user);
    expect(result.id).toBe("123");
  });
});
