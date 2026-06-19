import { describe, expect, it, vi } from "vitest";
import {
  createFieldBlurHandler,
  focusFormFieldById,
  getFirstInvalidField,
} from "../formValidationFocus";

describe("formValidationFocus", () => {
  it("getFirstInvalidField returns the first key with an error in field order", () => {
    const errors = { name: "", email: "Invalid email", age: "Required" };
    expect(getFirstInvalidField(errors, ["name", "email", "age"])).toBe("email");
    expect(getFirstInvalidField(errors, ["age", "email"])).toBe("age");
  });

  it("createFieldBlurHandler validates using the latest values", () => {
    const validateField = vi.fn();
    let values = { name: "a" };
    const getValues = () => values;

    const onBlur = createFieldBlurHandler("name", getValues, validateField);
    values = { name: "Alice" };
    onBlur();

    expect(validateField).toHaveBeenCalledWith("name", "Alice", { name: "Alice" });
  });

  it("focusFormFieldById focuses an element by id", () => {
    const input = document.createElement("input");
    input.id = "test-field";
    input.scrollIntoView = vi.fn();
    document.body.appendChild(input);
    const focusSpy = vi.spyOn(input, "focus");

    focusFormFieldById("test-field");

    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(focusSpy).toHaveBeenCalled();
        expect(input.scrollIntoView).toHaveBeenCalled();
        document.body.removeChild(input);
        resolve();
      });
    });
  });
});
