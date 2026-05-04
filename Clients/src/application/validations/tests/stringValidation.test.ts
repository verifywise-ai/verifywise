import { checkStringValidation } from "../stringValidation";

describe("Test String Validation", () => {
  it("if value is falsy and minLength is bigger than 0, should return accepted false with required message", () => {
    const falsyValues = [undefined, null, "", " "];
    falsyValues.forEach((val) => {
      const result = checkStringValidation("Test Field", val as unknown as string, 1);
      expect(result).toEqual({
        accepted: false,
        message: "Test Field is required.",
      });
    });
  });
  it("should return accepted false if value is empty string, but not type password, with appropriate message", () => {
    const result = checkStringValidation("Test Field", "     ");
    expect(result).toEqual({
      accepted: false,
      message: "Test Field cannot be an empty string.",
    });
  });
  it("should return accepted false if value is shorter than minLength with appropriate message", () => {
    const result = checkStringValidation("Test Field", "abc", 5);
    expect(result).toEqual({
      accepted: false,
      message: "Test Field can't be shorter than 5 characters.",
    });
  });
  it("should return accepted false if value is longer than maxLength with appropriate message", () => {
    const result = checkStringValidation("Test Field", "a".repeat(10), 0, 8);
    expect(result).toEqual({
      accepted: false,
      message: "Test Field can't be longer than 8 characters.",
    });
  });
  it("if hasUpperCase is true and value has no uppercase letters, should return accepted false with appropriate message", () => {
    const result = checkStringValidation("Test Field", "lowercase", 0, 12, true);
    expect(result).toEqual({
      accepted: false,
      message: "Test Field must contain at least one uppercase letter.",
    });
  });
  it("if hasLowerCase is true and value has no lowercase letters, should return accepted false with appropriate message", () => {
    const result = checkStringValidation("Test Field", "UPPERCASE", 0, 12, false, true);
    expect(result).toEqual({
      accepted: false,
      message: "Test Field must contain at least one lowercase letter.",
    });
  });
  it("if hasNumber is true and value has no numbers, should return accepted false with appropriate message", () => {
    const result = checkStringValidation("Test Field", "NoNumbersHere", 0, 20, false, false, true);
    expect(result).toEqual({
      accepted: false,
      message: "Test Field must contain at least one number.",
    });
  });
  it("if hasSpecialCharacter is true and value has no special characters, should return accepted false with appropriate message", () => {
    const result = checkStringValidation(
      "Test Field",
      "NoSpecials1",
      0,
      20,
      false,
      false,
      false,
      true,
    );
    expect(result).toEqual({
      accepted: false,
      message: "Test Field must contain at least one special character.",
    });
  });
  it("if type is email, and value is not a valid email, should return accepted false with appropriate message", () => {
    const result = checkStringValidation(
      "Email Address",
      "invalid-email",
      0,
      50,
      false,
      false,
      false,
      false,
      "email",
    );
    expect(result).toEqual({
      accepted: false,
      message: "Invalid Email Address.",
    });
  });
  it("if type is email, and value is a valid email, should return accepted true with success message", () => {
    const result = checkStringValidation(
      "Email Address",
      "valid@email.com",
      0,
      50,
      false,
      false,
      false,
      false,
      "email",
    );
    expect(result).toEqual({
      accepted: true,
      message: "Success",
    });
  });
  it("if type is contactPerson and value contains numbers, should return accepted false with appropriate message", () => {
    const result = checkStringValidation(
      "Contact Person",
      "John Doe123",
      0,
      50,
      false,
      false,
      false,
      false,
      "contactPerson",
    );
    expect(result).toEqual({
      accepted: false,
      message: "Contact Person must only contain letters and spaces",
    });
  });
  it("if type is contactPerson and value contains only letters and spaces, should return accepted true with success message", () => {
    const result = checkStringValidation(
      "Contact Person",
      "John Doe",
      0,
      50,
      false,
      false,
      false,
      false,
      "contactPerson",
    );
    expect(result).toEqual({
      accepted: true,
      message: "Success",
    });
  });
  it("if all conditions are met, should return accepted true with success message", () => {
    const result = checkStringValidation("Test Field", "Valid1!", 1, 20, true, true, true, true);
    expect(result).toEqual({
      accepted: true,
      message: "Success",
    });
  });
});
