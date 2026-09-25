import { describe, expect, it } from "vitest";
import { generatePassword } from "../src/password";

/**
 * Mirrors Servers/domain.layer/validations/password.valid.ts. Copied rather
 * than imported so this test fails loudly if the backend policy is tightened
 * and the generator is not updated with it.
 */
function meetsBackendPolicy(password: string): boolean {
  return (
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    password.length >= 8 &&
    password.length <= 128
  );
}

describe("generatePassword", () => {
  it("always satisfies the backend password policy", () => {
    for (let i = 0; i < 500; i++) {
      expect(meetsBackendPolicy(generatePassword())).toBe(true);
    }
  });

  it("satisfies the policy at the minimum allowed length", () => {
    for (let i = 0; i < 200; i++) {
      const password = generatePassword(8);
      expect(password).toHaveLength(8);
      expect(meetsBackendPolicy(password)).toBe(true);
    }
  });

  it("defaults to 20 characters", () => {
    expect(generatePassword()).toHaveLength(20);
  });

  it("refuses a length the backend would reject", () => {
    expect(() => generatePassword(7)).toThrow(/at least 8/);
  });

  it("does not pin the guaranteed characters to fixed positions", () => {
    const firstChars = new Set(Array.from({ length: 200 }, () => generatePassword()[0]));
    expect(firstChars.size).toBeGreaterThan(4);
  });

  it("does not repeat itself", () => {
    const generated = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(generated.size).toBe(200);
  });

  it("excludes visually ambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).not.toMatch(/[0O1lI]/);
    }
  });
});
