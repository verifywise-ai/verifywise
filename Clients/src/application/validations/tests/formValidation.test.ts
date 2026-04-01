import {
  FormValues,
  validateForm,
  validateOrganizationForm,
  validatePassword,
} from "../formValidation";
import { FormValidationBuilder } from "./mocks/formValidation.mock";

describe("Test form validations", () => {
  describe("validateForm", () => {
    it("should not accept empty name", () => {
      const form = new FormValidationBuilder().withEmptyName().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          name: "Name is required.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept name shorter than minimum length", () => {
      const form = new FormValidationBuilder().withShortName().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          name: "Name can't be shorter than 2 characters.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept name longer than maximum length", () => {
      const form = new FormValidationBuilder().withLongName().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          name: "Name can't be longer than 50 characters.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept empty surname", () => {
      const form = new FormValidationBuilder().withEmptySurname().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          surname: "Surname is required.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept surname shorter than minimum length", () => {
      const form = new FormValidationBuilder().withShortSurname().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          surname: "Surname can't be shorter than 2 characters.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept surname longer than maximum length", () => {
      const form = new FormValidationBuilder().withLongSurname().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          surname: "Surname can't be longer than 50 characters.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept invalid email", () => {
      const form = new FormValidationBuilder().withInvalidEmail().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          email: "Invalid Email.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept email longer than minimum length", () => {
      const form = new FormValidationBuilder().withLongEmail().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          email: "Email can't be longer than 128 characters.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept password shorter than minimum length", () => {
      const form = new FormValidationBuilder().withShortPassword().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          password: "Password can't be shorter than 8 characters.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept password longer than maximum length", () => {
      const form = new FormValidationBuilder().withLongPassword().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          password: "Password can't be longer than 32 characters.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept non-matching confirm password", () => {
      const form = new FormValidationBuilder()
        .withNonMatchingConfirmPassword()
        .build();
      const result = validateForm(form);
      const expected = {
        isFormValid: false,
        errors: {
          confirmPassword:
            "Password confirmation does not match. Please re-enter.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should pass validation for valid form values", () => {
      const form = new FormValidationBuilder().build();
      const result = validateForm(form);
      const expected = {
        isFormValid: true,
        errors: {},
      };
      expect(result).toEqual(expected);
    });
  });
  describe("validatePassword", () => {
    it("should return the correct validation result for various password inputs", () => {
      const passwordList = [
        {
          password: "Pass1!",
          expected: {
            length: false,
            specialChar: true,
            uppercase: true,
            number: true,
          },
        },
        {
          password: "Password123!",
          expected: {
            length: true,
            specialChar: true,
            uppercase: true,
            number: true,
          },
        },
        {
          password: "password123!",
          expected: {
            length: true,
            specialChar: true,
            uppercase: false,
            number: true,
          },
        },
        {
          password: "Password!!!",
          expected: {
            length: true,
            specialChar: true,
            uppercase: true,
            number: false,
          },
        },
        {
          password: "ValidPass1!",
          expected: {
            length: true,
            specialChar: true,
            uppercase: true,
            number: true,
          },
        },
      ];
      passwordList.forEach((item) => {
        const validation = validatePassword({
          password: item.password,
        } as FormValues);
        expect(validation).toEqual(item.expected);
      });
    });
  });
  describe("validateOrganizationForm", () => {
    it("should not accept organization name shorter than minimum length", () => {
      const organization = {
        organizationName: "A",
      };
      const result = validateOrganizationForm(organization);
      const expected = {
        isFormValid: false,
        errors: {
          organizationName:
            "Organization name can't be shorter than 2 characters.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should not accept organization name longer than maximum length", () => {
      const organization = {
        organizationName: "A".repeat(51),
      };
      const result = validateOrganizationForm(organization);
      const expected = {
        isFormValid: false,
        errors: {
          organizationName:
            "Organization name can't be longer than 50 characters.",
        },
      };
      expect(result).toEqual(expected);
    });
    it("should pass validation for valid organization form values", () => {
      const organization = {
        organizationName: "Valid Organization",
      };
      const result = validateOrganizationForm(organization);
      const expected = {
        isFormValid: true,
        errors: {},
      };
      expect(result).toEqual(expected);
    });
  });
});
