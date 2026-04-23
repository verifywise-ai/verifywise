import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormValidation } from "../useFormValidation";

interface TestForm {
  name: string;
  email: string;
  confirmPassword: string;
  password: string;
}

describe("useFormValidation", () => {
  const validators = {
    name: (v: unknown) => (v as string).length < 2 ? "Name too short" : "",
    email: (v: unknown) => !(v as string).includes("@") ? "Invalid email" : "",
    confirmPassword: (v: unknown, values: TestForm) =>
      v !== values.password ? "Passwords must match" : "",
  };

  it("starts with no errors", () => {
    const { result } = renderHook(() => useFormValidation<TestForm>(validators));
    expect(result.current.errors).toEqual({});
    expect(result.current.hasErrors).toBe(false);
    expect(result.current.canSubmit).toBe(true);
  });

  it("validateField sets error for invalid field", () => {
    const { result } = renderHook(() => useFormValidation<TestForm>(validators));

    act(() => {
      result.current.validateField("name", "a", { name: "a", email: "", confirmPassword: "", password: "" });
    });

    expect(result.current.errors.name).toBe("Name too short");
    expect(result.current.hasErrors).toBe(true);
  });

  it("validateField clears error for valid field", () => {
    const { result } = renderHook(() => useFormValidation<TestForm>(validators));

    act(() => {
      result.current.validateField("name", "a", { name: "a", email: "", confirmPassword: "", password: "" });
    });
    act(() => {
      result.current.validateField("name", "Alice", { name: "Alice", email: "", confirmPassword: "", password: "" });
    });

    expect(result.current.errors.name).toBe("");
    expect(result.current.hasErrors).toBe(false);
  });

  it("clearFieldError removes error for a field", () => {
    const { result } = renderHook(() => useFormValidation<TestForm>(validators));

    act(() => {
      result.current.validateField("name", "x", { name: "x", email: "", confirmPassword: "", password: "" });
    });
    act(() => {
      result.current.clearFieldError("name");
    });

    expect(result.current.errors.name).toBe("");
  });

  it("validateAll returns true when all fields valid", () => {
    const { result } = renderHook(() => useFormValidation<TestForm>(validators));

    let isValid: boolean;
    act(() => {
      isValid = result.current.validateAll({
        name: "Alice",
        email: "alice@test.com",
        confirmPassword: "pass123",
        password: "pass123",
      });
    });

    expect(isValid!).toBe(true);
    expect(result.current.hasErrors).toBe(false);
  });

  it("validateAll returns false when fields are invalid", () => {
    const { result } = renderHook(() => useFormValidation<TestForm>(validators));

    let isValid: boolean;
    act(() => {
      isValid = result.current.validateAll({
        name: "x",
        email: "bad",
        confirmPassword: "a",
        password: "b",
      });
    });

    expect(isValid!).toBe(false);
    expect(result.current.errors.name).toBe("Name too short");
    expect(result.current.errors.email).toBe("Invalid email");
    expect(result.current.errors.confirmPassword).toBe("Passwords must match");
  });

  it("resetErrors clears all errors", () => {
    const { result } = renderHook(() => useFormValidation<TestForm>(validators));

    act(() => {
      result.current.validateAll({ name: "x", email: "bad", confirmPassword: "", password: "" });
    });
    act(() => {
      result.current.resetErrors();
    });

    expect(result.current.errors).toEqual({});
    expect(result.current.hasErrors).toBe(false);
  });
});
