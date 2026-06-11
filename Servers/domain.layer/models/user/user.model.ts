/**
 * @fileoverview User Model
 *
 * Defines the User entity with comprehensive validation, security features, and business logic.
 * Implements secure user management with role-based access control, password hashing, and
 * multi-tenant organization support.
 *
 * Database Schema:
 * - id: Auto-incrementing primary key
 * - name: User's first name (min 2 chars)
 * - surname: User's last name (min 2 chars)
 * - email: Email address (validated format)
 * - password_hash: Bcrypt hashed password (10 rounds)
 * - role_id: Foreign key to RoleModel
 * - created_at: Account creation timestamp
 * - last_login: Last successful login timestamp
 * - is_demo: Flag for demo/sandbox users
 * - organization_id: Foreign key to OrganizationModel (multi-tenancy)
 *
 * Key Features:
 * - Automatic password hashing with bcrypt
 * - Email and password validation
 * - Role-based permission checks
 * - Demo user restrictions
 * - Organization-scoped operations
 * - Secure data serialization (password excluded)
 *
 * Security Features:
 * - Bcrypt password hashing (10 rounds)
 * - Password strength validation (uppercase, lowercase, digit, 8+ chars)
 * - Constant-time password comparison
 * - Demo user operation restrictions
 * - Admin self-demotion prevention
 * - Sensitive data filtering in toSafeJSON()
 *
 * @module domain.layer/models/user
 */

import { Column, DataType, ForeignKey, Model, Table } from "sequelize-typescript";
import { RoleModel } from "../role/role.model";
import { emailValidation } from "../../validations/email.valid";
import { numberValidation } from "../../validations/number.valid";
import { passwordValidation } from "../../validations/password.valid";
import { ValidationException, BusinessLogicException } from "../../exceptions/custom.exception";
import bcrypt from "bcrypt";
import { OrganizationModel } from "../organization/organization.model";
import { SSOProvider } from "../../interfaces/i.ssoConfig";

@Table({
  tableName: "users",
  timestamps: true,
  underscored: true,
})
export class UserModel extends Model<UserModel> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({
    type: DataType.STRING,
  })
  name!: string;

  @Column({
    type: DataType.STRING,
  })
  surname!: string;

  @Column({
    type: DataType.STRING,
  })
  email!: string;

  @Column({
    type: DataType.STRING,
  })
  password_hash!: string;

  @ForeignKey(() => RoleModel)
  @Column({
    type: DataType.INTEGER,
  })
  role_id!: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  created_at!: Date;

  @Column({
    type: DataType.DATE,
  })
  last_login!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  updated_at?: Date;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  is_demo?: boolean;

  @ForeignKey(() => OrganizationModel)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  organization_id?: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  profile_photo_id?: number;

  @Column({
    type: DataType.ENUM("AzureAD"),
    allowNull: true,
  })
  sso_provider?: SSOProvider;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  sso_user_id?: string;

  /**
   * Creates a new user with validation and password hashing
   *
   * Factory method that creates a UserModel instance with validated data and hashed password.
   * Does NOT save to database - caller must persist using query utilities.
   *
   * @static
   * @async
   * @param {string} name - User's first name (min 2 chars)
   * @param {string} surname - User's last name (min 2 chars)
   * @param {string} email - Email address (validated format)
   * @param {string} password - Plain text password (will be hashed)
   * @param {number} role_id - Role ID (1=Admin, 2=Reviewer, 3=Editor, 4=Auditor)
   * @param {number} organization_id - Organization ID for multi-tenancy
   * @returns {Promise<UserModel>} UserModel instance (not yet persisted)
   * @throws {ValidationException} If any field fails validation
   *
   * @security
   * - Password hashed with bcrypt (10 rounds)
   * - Email format validated
   * - Password strength validated (uppercase, lowercase, digit, 8+ chars)
   * - Role and organization IDs validated (must be >= 1)
   *
   * @example
   * const user = await UserModel.createNewUser(
   *   'John', 'Doe', 'john@example.com', 'SecurePass123!', 1, 1
   * );
   * // User instance created but not saved to database yet
   */
  static async createNewUser(
    name: string,
    surname: string,
    email: string,
    password: string | null,
    role_id: number,
    organization_id: number,
    sso_provider?: SSOProvider,
    sso_user_id?: string,
  ): Promise<UserModel> {
    // Validate email
    if (!emailValidation(email)) {
      throw new ValidationException("Invalid email format", "email", email);
    }

    const isSSO = !!sso_provider && !!sso_user_id;

    if (!isSSO) {
      const passwordValidationResult = passwordValidation(password ?? "");
      if (!passwordValidationResult.isValid) {
        throw new ValidationException(
          "Password must contain at least one lowercase letter, one uppercase letter, one digit, and be at least 8 characters long",
          "password",
          undefined,
          { metadata: { validationDetails: passwordValidationResult } },
        );
      }
    }

    // Validate role_id
    if (!numberValidation(role_id, 1)) {
      throw new ValidationException("Invalid role_id", "role_id", role_id);
    }
    // Validate organization_id
    if (!numberValidation(organization_id, 1)) {
      throw new ValidationException("Invalid organization_id", "organization_id", organization_id);
    }

    const user = new UserModel();
    user.name = name;
    user.surname = surname;
    user.email = email;
    user.password_hash = isSSO ? (null as unknown as string) : await bcrypt.hash(password!, 10);
    user.role_id = role_id;
    user.created_at = new Date();
    user.last_login = new Date();
    user.is_demo = false;
    user.organization_id = organization_id;
    user.sso_provider = sso_provider;
    user.sso_user_id = sso_user_id;

    return user;
  }

  /**
   * Updates user's profile information with validation
   *
   * Allows partial updates of name, surname, and email with field-level validation.
   * Changes are applied to the instance but not persisted to database.
   *
   * @async
   * @param {Object} updateData - Fields to update
   * @param {string} [updateData.name] - New first name (min 2 chars)
   * @param {string} [updateData.surname] - New last name (min 2 chars)
   * @param {string} [updateData.email] - New email (validated format)
   * @returns {Promise<void>}
   * @throws {ValidationException} If any field fails validation
   *
   * @example
   * await user.updateCurrentUser({ name: 'Jane', email: 'jane@example.com' });
   * // User instance updated but not saved to database yet
   */
  async updateCurrentUser(updateData: {
    name?: string;
    surname?: string;
    email?: string;
  }): Promise<void> {
    // Validate name if provided
    if (updateData.name !== undefined) {
      if (!updateData.name || updateData.name.trim().length === 0) {
        throw new ValidationException("Name is required", "name", updateData.name);
      }
      if (updateData.name.trim().length < 2) {
        throw new ValidationException(
          "Name must be at least 2 characters long",
          "name",
          updateData.name,
        );
      }
      this.name = updateData.name.trim();
    }

    // Validate surname if provided
    if (updateData.surname !== undefined) {
      if (!updateData.surname || updateData.surname.trim().length === 0) {
        throw new ValidationException("Surname is required", "surname", updateData.surname);
      }
      if (updateData.surname.trim().length < 2) {
        throw new ValidationException(
          "Surname must be at least 2 characters long",
          "surname",
          updateData.surname,
        );
      }
      this.surname = updateData.surname.trim();
    }

    // Validate email if provided
    if (updateData.email !== undefined) {
      if (!emailValidation(updateData.email)) {
        throw new ValidationException("Valid email is required", "email", updateData.email);
      }
      this.email = updateData.email.trim();
    }
  }

  /**
   * Validates all user data fields before persistence
   *
   * Performs comprehensive validation of all required fields.
   * Should be called before saving user to database.
   *
   * @async
   * @returns {Promise<void>}
   * @throws {ValidationException} If any required field is missing or invalid
   *
   * @validation
   * - Name: Required, min 2 chars
   * - Surname: Required, min 2 chars
   * - Email: Required, valid format
   * - Role ID: Required, >= 1
   * - Organization ID: If present, must be >= 1
   *
   * @example
   * await user.validateUserData();
   * // Throws ValidationException if any field is invalid
   */
  async validateUserData(): Promise<void> {
    if (!this.name || this.name.trim().length === 0) {
      throw new ValidationException("Name is required", "name", this.name);
    }

    if (this.name.trim().length < 2) {
      throw new ValidationException("Name must be at least 2 characters long", "name", this.name);
    }

    if (!this.surname || this.surname.trim().length === 0) {
      throw new ValidationException("Surname is required", "surname", this.surname);
    }

    if (this.surname.trim().length < 2) {
      throw new ValidationException(
        "Surname must be at least 2 characters long",
        "surname",
        this.surname,
      );
    }

    if (!this.email || !emailValidation(this.email)) {
      throw new ValidationException("Valid email is required", "email", this.email);
    }

    if (!this.role_id || !numberValidation(this.role_id, 1)) {
      throw new ValidationException("Valid role_id is required", "role_id", this.role_id);
    }

    if (this.organization_id && !numberValidation(this.organization_id, 1)) {
      throw new ValidationException(
        "Valid organization_id is required",
        "organization_id",
        this.organization_id,
      );
    }
  }

  /**
   * Compares plaintext password with stored hash
   *
   * Uses bcrypt's constant-time comparison to prevent timing attacks.
   *
   * @async
   * @param {string} password - Plaintext password to verify
   * @returns {Promise<boolean>} True if password matches, false otherwise
   *
   * @security
   * - Constant-time comparison via bcrypt
   * - No information leakage about password correctness timing
   *
   * @example
   * const isValid = await user.comparePassword('userPassword123');
   * if (isValid) {
   *   // Password is correct
   * }
   */
  async comparePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password_hash);
  }

  /**
   * Updates user's password with validation and security checks
   *
   * Validates new password strength, optionally verifies current password,
   * and prevents demo users from changing passwords.
   *
   * @async
   * @param {string} newPassword - New plaintext password (will be hashed)
   * @param {string} [currentPassword] - Current password for verification
   * @returns {Promise<void>}
   * @throws {ValidationException} If password validation fails or current password incorrect
   * @throws {BusinessLogicException} If user is demo user
   *
   * @security
   * - New password validated for strength requirements
   * - Current password verified if provided
   * - Demo user restriction enforced
   * - Password hashed with bcrypt (10 rounds)
   *
   * @example
   * await user.updatePassword('NewSecurePass123!', 'OldPassword123');
   * // Password updated in instance but not persisted to database
   */
  async updatePassword(newPassword: string, currentPassword?: string): Promise<void> {
    // Validate new password
    const passwordValidationResult = passwordValidation(newPassword);
    if (!passwordValidationResult.isValid) {
      throw new ValidationException(
        "Password must contain at least one lowercase letter, one uppercase letter, one digit, and be at least 8 characters long",
        "password",
        undefined,
        { metadata: { validationDetails: passwordValidationResult } },
      );
    }

    // If current password is provided, verify it matches
    if (currentPassword) {
      const isCurrentPasswordValid = await this.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        throw new ValidationException(
          "Current password is incorrect",
          "currentPassword",
          undefined,
        );
      }
    }

    // Prevent demo users from changing passwords
    if (this.isDemoUser()) {
      throw new BusinessLogicException(
        "Demo users cannot change their passwords",
        "DEMO_USER_RESTRICTION",
        { userId: this.id, userEmail: this.email },
      );
    }

    // Hash and update the password
    this.password_hash = await bcrypt.hash(newPassword, 10);
  }

  /**
   * Updates user's role with comprehensive security validations
   *
   * Enforces role change business rules including admin-only permission,
   * demo user restrictions, and self-demotion prevention.
   *
   * @async
   * @param {number} newRoleId - New role ID to assign
   * @param {UserModel} currentUser - User performing the role change (for authorization)
   * @returns {Promise<void>}
   * @throws {ValidationException} If role ID is invalid
   * @throws {BusinessLogicException} If security rules violated
   *
   * @security
   * - Only admins can update roles
   * - Demo users cannot be assigned admin role
   * - Admins cannot demote themselves
   * - Role ID validated (must be >= 1)
   *
   * @example
   * await targetUser.updateRole(2, adminUser); // Change to Reviewer role
   * // Role updated in instance but not persisted to database
   */
  async updateRole(newRoleId: number, currentUser: UserModel): Promise<void> {
    // Validate role_id
    if (!numberValidation(newRoleId, 1)) {
      throw new ValidationException(
        "Valid role_id is required (must be >= 1)",
        "role_id",
        newRoleId,
      );
    }

    // Security check: Only administrators can update user roles
    if (!currentUser.isAdmin()) {
      throw new BusinessLogicException(
        "Only administrators can update user roles",
        "INSUFFICIENT_PERMISSIONS",
        {
          currentUserId: currentUser.id,
          targetUserId: this.id,
          requestedRoleId: newRoleId,
        },
      );
    }

    // Prevent demo users from being assigned admin roles
    if (this.isDemoUser() && newRoleId === 1) {
      throw new BusinessLogicException(
        "Demo users cannot be assigned admin roles",
        "DEMO_USER_RESTRICTION",
        { userId: this.id, requestedRoleId: newRoleId },
      );
    }

    // Prevent users from demoting themselves from admin role
    if (this.id === currentUser.id && this.role_id === 1 && newRoleId !== 1) {
      throw new BusinessLogicException(
        "Administrators cannot demote themselves from admin role",
        "SELF_DEMOTION_RESTRICTION",
        {
          userId: this.id,
          currentRoleId: this.role_id,
          requestedRoleId: newRoleId,
        },
      );
    }

    // Update the role
    this.role_id = newRoleId;
  }

  /**
   * Checks if user can perform administrative actions
   *
   * Verifies user is admin and not a demo user.
   *
   * @returns {boolean} True if user can perform admin actions
   * @throws {BusinessLogicException} If user is demo user
   *
   * @example
   * if (user.canPerformAdminAction()) {
   *   // User is admin and can proceed
   * }
   */
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

  /**
   * Checks if user can modify another user's data
   *
   * Admins can modify anyone, regular users can only modify themselves.
   *
   * @param {number} targetUserId - ID of user to be modified
   * @returns {boolean} True if modification is allowed
   * @throws {BusinessLogicException} If current user is demo user
   *
   * @example
   * if (currentUser.canModifyUser(targetUser.id)) {
   *   // Proceed with modification
   * }
   */
  canModifyUser(targetUserId: number): boolean {
    if (this.isDemoUser()) {
      throw new BusinessLogicException(
        "Demo users cannot modify other users",
        "DEMO_USER_RESTRICTION",
        { userId: this.id, targetUserId },
      );
    }

    // Admin can modify anyone, regular users can only modify themselves
    return this.isAdmin() || this.id === targetUserId;
  }

  /**
   * Validates email uniqueness across all users
   *
   * Placeholder method - actual implementation should query database.
   * Currently returns true to delegate to database-level uniqueness constraint.
   *
   * @static
   * @async
   * @param {string} email - Email to check for uniqueness
   * @param {number} [excludeUserId] - User ID to exclude from check (for updates)
   * @returns {Promise<boolean>} True if email is unique
   *
   * @todo Implement actual database query for email uniqueness
   *
   * @example
   * const isUnique = await UserModel.validateEmailUniqueness('new@example.com');
   * if (!isUnique) {
   *   throw new ValidationException('Email already exists');
   * }
   */
  static async validateEmailUniqueness(_email: string, _excludeUserId?: number): Promise<boolean> {
    // This is a placeholder implementation
    // In real implementation, you would query the database like:
    // const existingUser = await UserModel.findOne({ where: { email } });
    // if (existingUser && existingUser.id !== excludeUserId) {
    //   return false; // Email already exists
    // }
    // return true; // Email is unique

    // For now, return true to allow the operation to proceed
    // The actual uniqueness check should be handled at the database level
    return true;
  }

  /**
   * Returns user data without sensitive information
   *
   * Filters out password_hash and returns safe representation for API responses.
   *
   * @returns {Object} User data without password_hash
   *
   * @security
   * - Password hash excluded from output
   * - Safe for API responses and logging
   *
   * @example
   * const safeUser = user.toSafeJSON();
   * res.json(safeUser); // Password hash not included
   */
  toSafeJSON(): any {
    const { password_hash, ...safeUser } = this.get({ plain: true });
    return safeUser;
  }

  /**
   * Get user's full name
   */
  getFullName(): string {
    return `${this.name} ${this.surname}`.trim();
  }

  /**
   * Check if user is a demo user
   */
  isDemoUser(): boolean {
    return this.is_demo ?? false;
  }

  /**
   * Check if user is an admin
   */
  isAdmin(): boolean {
    return this.role_id === 1;
  }

  /**
   * Update last login timestamp
   */
  updateLastLogin(): void {
    this.last_login = new Date();
  }

  /**
   * Create UserModel instance from JSON data
   */
  static fromJSON(json: any): UserModel {
    return new UserModel(json);
  }

  /**
   * Convert user model to JSON representation
   */
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      surname: this.surname,
      email: this.email,
      role_id: this.role_id,
      created_at: (this.createdAt ?? this.created_at)?.toISOString(),
      last_login: this.last_login?.toISOString(),
      is_demo: this.is_demo,
    };
  }

  /**
   * Get user's display name (first name + last name initial)
   */
  getDisplayName(): string {
    const firstName = this.name || "";
    const lastNameInitial = this.surname ? this.surname.charAt(0) + "." : "";
    return `${firstName} ${lastNameInitial}`.trim();
  }

  /**
   * Check if user account is active (not demo or has recent activity)
   */
  isActive(): boolean {
    if (this.isDemoUser()) {
      return false;
    }

    // Consider user active if they've logged in within the last 30 days
    if (this.last_login) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return this.last_login > thirtyDaysAgo;
    }

    return true; // New users are considered active
  }
}
