import { renderHook, act } from "@testing-library/react";
import { useFormValidation } from "../useFormValidation";

describe("useFormValidation", () => {
  interface TestForm {
    name: string;
    email: string;
    age: number;
  }

  const validators = {
    name: (value: unknown) => {
      const str = value as string;
      if (!str) return "Name is required";
      if (str.length < 2) return "Name must be at least 2 characters";
      return "";
    },
    email: (value: unknown) => {
      const str = value as string;
      if (!str) return "Email is required";
      if (!str.includes("@")) return "Invalid email format";
      return "";
    },
    age: (value: unknown) => {
      const num = value as number;
      if (isNaN(num)) return "Age is required";
      if (num < 18) return "Must be at least 18 years old";
      return "";
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("initial state", () => {
    it("should start with no errors", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      expect(result.current.errors).toEqual({});
      expect(result.current.hasErrors).toBe(false);
      expect(result.current.canSubmit).toBe(true);
    });
  });

  describe("validateField", () => {
    it("should validate a field and set error", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      act(() => {
        result.current.validateField("name", "", { name: "", email: "", age: 0 });
      });

      expect(result.current.errors.name).toBe("Name is required");
      expect(result.current.hasErrors).toBe(true);
      expect(result.current.canSubmit).toBe(false);
    });

    it("should validate a field and clear error when valid", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      act(() => {
        result.current.validateField("name", "", { name: "", email: "", age: 0 });
      });

      expect(result.current.errors.name).toBe("Name is required");

      act(() => {
        result.current.validateField("name", "John", { name: "John", email: "", age: 0 });
      });

      expect(result.current.errors.name).toBe("");
    });

    it("should return error message from validator", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      const error = result.current.validateField(
        "name",
        "A",
        { name: "A", email: "", age: 0 }
      );

      expect(error).toBe("Name must be at least 2 characters");
    });

    it("should skip validation for fields without validators", () => {
      const { result } = renderHook(() =>
        useFormValidation<{ name: string }>({
          name: validators.name,
        })
      );

      act(() => {
        result.current.validateField("name" as keyof { name: string }, "", { name: "" });
      });

      expect(result.current.errors.name).toBe("Name is required");
    });
  });

  describe("clearFieldError", () => {
    it("should clear a specific field error", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      act(() => {
        result.current.validateField("name", "", { name: "", email: "", age: 0 });
      });

      expect(result.current.errors.name).toBe("Name is required");

      act(() => {
        result.current.clearFieldError("name");
      });

      expect(result.current.errors.name).toBe("");
      expect(result.current.hasErrors).toBe(false);
    });
  });

  describe("validateAll", () => {
    it("should validate all fields and return false if any are invalid", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      let isValid = false;
      act(() => {
        isValid = result.current.validateAll({
          name: "",
          email: "",
          age: 10,
        });
      });

      expect(isValid).toBe(false);
      expect(result.current.errors.name).toBe("Name is required");
      expect(result.current.errors.email).toBe("Email is required");
      expect(result.current.errors.age).toBe("Must be at least 18 years old");
    });

    it("should validate all fields and return true if all are valid", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      const isValid = result.current.validateAll({
        name: "John",
        email: "john@example.com",
        age: 25,
      });

      expect(isValid).toBe(true);
      expect(result.current.hasErrors).toBe(false);
      expect(result.current.canSubmit).toBe(true);
    });

    it("should update all errors at once", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      act(() => {
        result.current.validateAll({
          name: "",
          email: "invalid",
          age: 15,
        });
      });

      expect(result.current.errors.name).toBe("Name is required");
      expect(result.current.errors.email).toBe("Invalid email format");
      expect(result.current.errors.age).toBe("Must be at least 18 years old");
    });
  });

  describe("hasErrors", () => {
    it("should be true when any field has an error", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      act(() => {
        result.current.validateField("name", "", { name: "", email: "", age: 0 });
      });

      expect(result.current.hasErrors).toBe(true);
    });

    it("should be false when all fields are valid", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      act(() => {
        result.current.validateAll({
          name: "John",
          email: "john@example.com",
          age: 25,
        });
      });

      expect(result.current.hasErrors).toBe(false);
    });
  });

  describe("canSubmit", () => {
    it("should be false when there are errors", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      act(() => {
        result.current.validateField("name", "", { name: "", email: "", age: 0 });
      });

      expect(result.current.canSubmit).toBe(false);
    });

    it("should be true when there are no errors", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      act(() => {
        result.current.validateAll({
          name: "John",
          email: "john@example.com",
          age: 25,
        });
      });

      expect(result.current.canSubmit).toBe(true);
    });
  });

  describe("resetErrors", () => {
    it("should clear all errors", () => {
      const { result } = renderHook(() =>
        useFormValidation<TestForm>(validators)
      );

      act(() => {
        result.current.validateAll({
          name: "",
          email: "invalid",
          age: 15,
        });
      });

      expect(result.current.hasErrors).toBe(true);

      act(() => {
        result.current.resetErrors();
      });

      expect(result.current.errors).toEqual({});
      expect(result.current.hasErrors).toBe(false);
      expect(result.current.canSubmit).toBe(true);
    });
  });

  describe("cross-field validation", () => {
    it("should support cross-field validation", () => {
      interface PasswordForm {
        password: string;
        confirmPassword: string;
      }

      const passwordValidators = {
        password: (value: unknown) => {
          const str = value as string;
          if (!str) return "Password is required";
          if (str.length < 8) return "Password must be at least 8 characters";
          return "";
        },
        confirmPassword: (value: unknown, values: PasswordForm) => {
          if (value !== values.password) return "Passwords must match";
          return "";
        },
      };

      const { result } = renderHook(() =>
        useFormValidation<PasswordForm>(passwordValidators)
      );

      act(() => {
        result.current.validateAll({
          password: "password123",
          confirmPassword: "different",
        });
      });

      expect(result.current.errors.confirmPassword).toBe("Passwords must match");
    });
  });
});
