import { describe, it, expect } from "vitest";
import { stringToColor } from "../stringToColor";

describe("stringToColor", () => {
  it("returns a string starting with # followed by 6 characters", () => {
    const result = stringToColor("John", "Doe");
    expect(result).toMatch(/^#.{6}$/);
  });

  it("is deterministic (same inputs produce same output)", () => {
    const first = stringToColor("Alice", "Smith");
    const second = stringToColor("Alice", "Smith");
    expect(first).toBe(second);
  });

  it("produces different colors for different name lengths", () => {
    const short = stringToColor("Al", "B");
    const long = stringToColor("Alexander", "Benjamin");
    expect(short).not.toBe(long);
  });

  it("handles empty strings without crashing", () => {
    // length 0: mod 10 = 0 → "012", mod 6 = 0 → "ABCDEF"
    const result = stringToColor("", "");
    expect(result).toMatch(/^#[0-9A-F]+$/i);
  });

  it("handles very long names without crashing", () => {
    const result = stringToColor("A".repeat(50), "B".repeat(50));
    expect(result).toMatch(/^#[0-9A-F]+$/i);
  });

  it("handles firstName length exactly 10 (mod 10 boundary)", () => {
    // length 10 → mod 10 = 0, first part loops from 0
    const result = stringToColor("A".repeat(10), "Test");
    expect(result).toMatch(/^#[0-9A-F]+$/i);
  });

  it("handles lastName length exactly 6 (mod 6 boundary)", () => {
    // length 6 → mod 6 = 0, second part loops from 0
    const result = stringToColor("Test", "A".repeat(6));
    expect(result).toMatch(/^#[0-9A-F]+$/i);
  });

  it("produces only hex-valid characters", () => {
    const result = stringToColor("John", "Doe");
    // Remove the # prefix and check the remaining chars are hex-valid
    const hexPart = result.slice(1);
    expect(hexPart).toMatch(/^[0-9A-F]+$/i);
  });
});
