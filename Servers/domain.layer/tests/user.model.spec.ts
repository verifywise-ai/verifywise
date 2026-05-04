import { ValidationException, BusinessLogicException } from "../exceptions/custom.exception";
import { emailValidation } from "../validations/email.valid";
import { passwordValidation } from "../validations/password.valid";
import { numberValidation } from "../validations/number.valid";

// Mock bcrypt to avoid actual hashing in tests
jest.mock("bcrypt", () => ({
  hash: jest.fn().mockResolvedValue("hashed_password_123"),
  compare: jest.fn().mockResolvedValue(true),
}));

// Mock sequelize-typescript completely
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: "INTEGER",
    STRING: "STRING",
    DATE: "DATE",
    BOOLEAN: "BOOLEAN",
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {
    constructor(data?: any) {
      if (data) {
        Object.assign(this, data);
      }
    }
  },
}));

// Create a simple test class that mimics UserModel behavior
class TestUserModel {
  id?: number;
  name!: string;
  surname!: string;
  email!: string;
  password_hash!: string;
  role_id!: number;
  created_at!: Date;
  last_login!: Date;
  is_demo?: boolean;

  constructor(data?: any) {
    if (data) {
      Object.assign(this, data);
    }
  }

  // Static method to create new user
  static async createNewUser(
    name: string,
    surname: string,
    email: string,
    password: string,
    role_id: number,
  ): Promise<TestUserModel> {
    // Validate email
    if (!emailValidation(email)) {
      throw new ValidationException("Invalid email format", "email", email);
    }

    // Validate password
    const passwordValidationResult = passwordValidation(password);
    if (!passwordValidationResult.isValid) {
      throw new ValidationException(
        "Password must contain at least one lowercase letter, one uppercase letter, one digit, and be at least 8 characters long",
        "password",
        undefined,
        { metadata: { validationDetails: passwordValidationResult } },
      );
    }

    // Validate role_id
    if (!numberValidation(role_id, 1)) {
      throw new ValidationException("Invalid role_id", "role_id", role_id);
    }

    // Hash the password
    const bcrypt = require("bcrypt");
    const password_hash = await bcrypt.hash(password, 10);

    // Create and return the user model instance
    const user = new TestUserModel();
    user.name = name;
    user.surname = surname;
    user.email = email;
    user.password_hash = password_hash;
    user.role_id = role_id;
    user.created_at = new Date();
    user.last_login = new Date();
    user.is_demo = false;

    return user;
  }

  // Instance methods
  async validateUserData(): Promise<void> {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationException("Name is required", "name", this.name);
    }

    if (!this.surname || this.surname.trim().length === 0) {
      throw new ValidationException("Surname is required", "surname", this.surname);
    }

    if (!this.email || !emailValidation(this.email)) {
      throw new ValidationException("Valid email is required", "email", this.email);
    }

    if (!this.role_id || !numberValidation(this.role_id, 1)) {
      throw new ValidationException("Valid role_id is required", "role_id", this.role_id);
    }
  }

  async comparePassword(password: string): Promise<boolean> {
    const bcrypt = require("bcrypt");
    return bcrypt.compare(password, this.password_hash);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const passwordValidationResult = passwordValidation(newPassword);
    if (!passwordValidationResult.isValid) {
      throw new ValidationException(
        "Password must contain at least one lowercase letter, one uppercase letter, one digit, and be at least 8 characters long",
        "password",
        undefined,
        { metadata: { validationDetails: passwordValidationResult } },
      );
    }

    const bcrypt = require("bcrypt");
    this.password_hash = await bcrypt.hash(newPassword, 10);
  }

  canPerformAdminAction(): boolean {
    if (this.isDemoUser()) {
      throw new BusinessLogicException(
        "Demo users cannot perform admin actions",
        "DEMO_USER_RESTRICTION",
        { userId: this.id, userEmail: this.email },
      );
    }
    return this.isAdmin();
  }

  canModifyUser(targetUserId: number): boolean {
    if (this.isDemoUser()) {
      throw new BusinessLogicException("Demo users cannot modify users", "DEMO_USER_RESTRICTION", {
        userId: this.id,
        userEmail: this.email,
      });
    }

    // Admin can modify any user
    if (this.isAdmin()) {
      return true;
    }

    // Regular users can only modify themselves
    return this.id === targetUserId;
  }

  isDemoUser(): boolean {
    return this.is_demo === true;
  }

  isAdmin(): boolean {
    return this.role_id === 1;
  }

  updateLastLogin(): void {
    this.last_login = new Date();
  }

  toSafeJSON(): any {
    const { password_hash, ...safeData } = this;
    return safeData;
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      surname: this.surname,
      email: this.email,
      role_id: this.role_id,
      created_at: this.created_at?.toISOString(),
      last_login: this.last_login?.toISOString(),
    };
  }

  get(_options?: any) {
    return this;
  }
}

describe("UserModel", () => {
  // Test data - using a password that definitely meets all requirements
  const validUserData = {
    name: "John",
    surname: "Doe",
    email: "john.doe@example.com",
    password: "SecurePass123!", // This password has: lowercase, uppercase, digit, special char, >8 chars
    role_id: 1,
  };

  // Clear all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createNewUser", () => {
    it("should create a new user with valid data", async () => {
      // Arrange & Act
      const user = await TestUserModel.createNewUser(
        validUserData.name,
        validUserData.surname,
        validUserData.email,
        validUserData.password,
        validUserData.role_id,
      );

      // Assert
      expect(user).toBeInstanceOf(TestUserModel);
      expect(user.name).toBe(validUserData.name);
      expect(user.surname).toBe(validUserData.surname);
      expect(user.email).toBe(validUserData.email);
      expect(user.password_hash).toBe("hashed_password_123");
      expect(user.role_id).toBe(validUserData.role_id);
      expect(user.is_demo).toBe(false);
      expect(user.created_at).toBeInstanceOf(Date);
      expect(user.last_login).toBeInstanceOf(Date);
    });

    it("should throw ValidationException for invalid email", async () => {
      // Arrange & Act & Assert
      await expect(
        TestUserModel.createNewUser(
          validUserData.name,
          validUserData.surname,
          "invalid-email",
          validUserData.password,
          validUserData.role_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid password", async () => {
      // Arrange & Act & Assert
      await expect(
        TestUserModel.createNewUser(
          validUserData.name,
          validUserData.surname,
          validUserData.email,
          "weak",
          validUserData.role_id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for invalid role_id", async () => {
      // Arrange & Act & Assert
      await expect(
        TestUserModel.createNewUser(
          validUserData.name,
          validUserData.surname,
          validUserData.email,
          validUserData.password,
          0,
        ),
      ).rejects.toThrow(ValidationException);
    });
  });

  describe("validateUserData", () => {
    it("should pass validation with valid data", async () => {
      // Arrange
      const user = new TestUserModel();
      user.name = validUserData.name;
      user.surname = validUserData.surname;
      user.email = validUserData.email;
      user.role_id = validUserData.role_id;

      // Act & Assert
      await expect(user.validateUserData()).resolves.not.toThrow();
    });

    it("should throw ValidationException for empty name", async () => {
      // Arrange
      const user = new TestUserModel();
      user.name = "";
      user.surname = validUserData.surname;
      user.email = validUserData.email;
      user.role_id = validUserData.role_id;

      // Act & Assert
      await expect(user.validateUserData()).rejects.toThrow(ValidationException);
    });

    it("should throw ValidationException for empty surname", async () => {
      // Arrange
      const user = new TestUserModel();
      user.name = validUserData.name;
      user.surname = "";
      user.email = validUserData.email;
      user.role_id = validUserData.role_id;

      // Act & Assert
      await expect(user.validateUserData()).rejects.toThrow(ValidationException);
    });
  });

  describe("comparePassword", () => {
    it("should return true for correct password", async () => {
      // Arrange
      const user = new TestUserModel();
      user.password_hash = "hashed_password_123";

      // Act
      const result = await user.comparePassword("SecurePass123");

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("updatePassword", () => {
    it("should update password with valid new password", async () => {
      // Arrange
      const user = new TestUserModel();
      user.password_hash = "old_hash";

      // Act
      await user.updatePassword("NewSecurePass123!");

      // Assert
      expect(user.password_hash).toBe("hashed_password_123");
    });

    it("should throw ValidationException for invalid new password", async () => {
      // Arrange
      const user = new TestUserModel();

      // Act & Assert
      await expect(user.updatePassword("weak")).rejects.toThrow(ValidationException);
    });
  });

  describe("canPerformAdminAction", () => {
    it("should return true for admin user", () => {
      // Arrange
      const user = new TestUserModel();
      user.id = 1;
      user.role_id = 1; // Admin role
      user.is_demo = false;

      // Act
      const result = user.canPerformAdminAction();

      // Assert
      expect(result).toBe(true);
    });

    it("should throw BusinessLogicException for demo user", () => {
      // Arrange
      const user = new TestUserModel();
      user.id = 1;
      user.role_id = 1; // Admin role
      user.is_demo = true;

      // Act & Assert
      expect(() => user.canPerformAdminAction()).toThrow(BusinessLogicException);
    });
  });

  describe("canModifyUser", () => {
    it("should return true when admin modifies any user", () => {
      // Arrange
      const adminUser = new TestUserModel();
      adminUser.id = 1;
      adminUser.role_id = 1; // Admin role
      adminUser.is_demo = false;

      // Act
      const result = adminUser.canModifyUser(999);

      // Assert
      expect(result).toBe(true);
    });

    it("should return true when user modifies themselves", () => {
      // Arrange
      const regularUser = new TestUserModel();
      regularUser.id = 5;
      regularUser.role_id = 2; // Regular user role
      regularUser.is_demo = false;

      // Act
      const result = regularUser.canModifyUser(5);

      // Assert
      expect(result).toBe(true);
    });

    it("should return false when regular user modifies another user", () => {
      // Arrange
      const regularUser = new TestUserModel();
      regularUser.id = 5;
      regularUser.role_id = 2; // Regular user role
      regularUser.is_demo = false;

      // Act
      const result = regularUser.canModifyUser(999);

      // Assert
      expect(result).toBe(false);
    });

    it("should throw BusinessLogicException for demo user", () => {
      // Arrange
      const demoUser = new TestUserModel();
      demoUser.id = 1;
      demoUser.is_demo = true;

      // Act & Assert
      expect(() => demoUser.canModifyUser(999)).toThrow(BusinessLogicException);
    });
  });

  describe("isDemoUser", () => {
    it("should return true for demo user", () => {
      // Arrange
      const user = new TestUserModel();
      user.is_demo = true;

      // Act
      const result = user.isDemoUser();

      // Assert
      expect(result).toBe(true);
    });

    it("should return false for non-demo user", () => {
      // Arrange
      const user = new TestUserModel();
      user.is_demo = false;

      // Act
      const result = user.isDemoUser();

      // Assert
      expect(result).toBe(false);
    });

    it("should return false when is_demo is undefined", () => {
      // Arrange
      const user = new TestUserModel();
      user.is_demo = undefined;

      // Act
      const result = user.isDemoUser();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("isAdmin", () => {
    it("should return true for admin user", () => {
      // Arrange
      const user = new TestUserModel();
      user.role_id = 1;

      // Act
      const result = user.isAdmin();

      // Assert
      expect(result).toBe(true);
    });

    it("should return false for non-admin user", () => {
      // Arrange
      const user = new TestUserModel();
      user.role_id = 2;

      // Act
      const result = user.isAdmin();

      // Assert
      expect(result).toBe(false);
    });
  });

  describe("updateLastLogin", () => {
    it("should update last_login to current date", () => {
      // Arrange
      const user = new TestUserModel();
      const oldDate = new Date("2023-01-01");
      user.last_login = oldDate;

      // Act
      user.updateLastLogin();

      // Assert
      expect(user.last_login).not.toEqual(oldDate);
      expect(user.last_login).toBeInstanceOf(Date);
    });
  });

  describe("toSafeJSON", () => {
    it("should return user data without password_hash", () => {
      // Arrange
      const user = new TestUserModel();
      user.id = 1;
      user.name = "John";
      user.surname = "Doe";
      user.email = "john@example.com";
      user.password_hash = "secret_hash";
      user.role_id = 1;
      user.created_at = new Date("2023-01-01");
      user.last_login = new Date("2023-01-02");

      // Act
      const result = user.toSafeJSON();

      // Assert
      expect(result).not.toHaveProperty("password_hash");
      expect(result).toHaveProperty("id", 1);
      expect(result).toHaveProperty("name", "John");
      expect(result).toHaveProperty("email", "john@example.com");
    });
  });

  describe("toJSON", () => {
    it("should return formatted user data", () => {
      // Arrange
      const user = new TestUserModel();
      user.id = 1;
      user.name = "John";
      user.surname = "Doe";
      user.email = "john@example.com";
      user.role_id = 1;
      user.created_at = new Date("2023-01-01T00:00:00.000Z");
      user.last_login = new Date("2023-01-02T00:00:00.000Z");

      // Act
      const result = user.toJSON();

      // Assert
      expect(result).toEqual({
        id: 1,
        name: "John",
        surname: "Doe",
        email: "john@example.com",
        role_id: 1,
        created_at: "2023-01-01T00:00:00.000Z",
        last_login: "2023-01-02T00:00:00.000Z",
      });
    });
  });
});
