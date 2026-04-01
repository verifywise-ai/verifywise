import { FormValues } from "../../formValidation";

const formMock: FormValues = {
  name: "John",
  surname: "Doe",
  email: "john.doe@email.com",
  password: "Password123!",
  confirmPassword: "Password123!",
  roleId: 1,
  organizationId: 1,
};

export class FormValidationBuilder {
  private readonly form: FormValues;

  constructor() {
    this.form = { ...formMock };
  }

  withEmptyName() {
    this.form.name = "";
    return this;
  }

  withShortName() {
    this.form.name = "J";
    return this;
  }

  withLongName() {
    this.form.name = "J".repeat(51);
    return this;
  }

  withEmptySurname() {
    this.form.surname = "";
    return this;
  }

  withShortSurname() {
    this.form.surname = "D";
    return this;
  }

  withLongSurname() {
    this.form.surname = "D".repeat(51);
    return this;
  }

  withInvalidEmail() {
    this.form.email = "invalid-email";
    return this;
  }

  withLongEmail() {
    this.form.email = "a".repeat(129) + "@email.com";
    return this;
  }

  withShortPassword() {
    this.form.password = "Pass1!";
    this.form.confirmPassword = "Pass1!";
    return this;
  }
  withLongPassword() {
    this.form.password = "P".repeat(33) + "1!";
    this.form.confirmPassword = "P".repeat(33) + "1!";
    return this;
  }

  withNonMatchingConfirmPassword() {
    this.form.confirmPassword = "Different123!";
    return this;
  }

  build(): FormValues {
    return this.form;
  }
}
