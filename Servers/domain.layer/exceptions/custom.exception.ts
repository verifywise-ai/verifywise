/**
 * CustomException - A comprehensive customizable exception system
 *
 * This module provides a base CustomException class and specific exception types
 * for different scenarios in the domain layer.
 */

export interface ExceptionMetadata {
  [key: string]: any;
}

export interface ExceptionOptions {
  code?: string;
  statusCode?: number;
  metadata?: ExceptionMetadata;
  cause?: Error;
  timestamp?: Date;
  /**
   * Translation key for i18n. When set, the controller's catch block uses
   * `req.t(error.i18nKey, error.i18nVars)` instead of `req.t(error.message)`,
   * which lets the dictionary include placeholders the literal `message`
   * cannot match (e.g. `"Action with ID {id} not found"` vs the interpolated
   * `"Action with ID 47 not found"`).
   */
  i18nKey?: string;
  i18nVars?: Record<string, string | number>;
}

/**
 * Base CustomException class that provides a foundation for all custom exceptions
 */
export class CustomException extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly metadata: ExceptionMetadata;
  public readonly timestamp: Date;
  public readonly cause?: Error;
  public readonly i18nKey?: string;
  public readonly i18nVars?: Record<string, string | number>;

  constructor(message: string, options: ExceptionOptions = {}) {
    super(message);

    this.name = this.constructor.name;
    this.code = options.code || "CUSTOM_EXCEPTION";
    this.statusCode = options.statusCode || 500;
    this.metadata = options.metadata || {};
    this.cause = options.cause;
    this.timestamp = options.timestamp || new Date();
    this.i18nKey = options.i18nKey;
    this.i18nVars = options.i18nVars;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, CustomException.prototype);
  }

  /**
   * Get a formatted error message with additional context
   */
  public getFormattedMessage(): string {
    const parts = [this.message];

    if (this.code !== "CUSTOM_EXCEPTION") {
      parts.push(`[${this.code}]`);
    }

    if (Object.keys(this.metadata).length > 0) {
      parts.push(`Metadata: ${JSON.stringify(this.metadata)}`);
    }

    return parts.join(" ");
  }

  /**
   * Convert exception to a plain object for serialization
   */
  public toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      cause: this.cause?.message,
    };
  }

  /**
   * Create a new exception with additional metadata
   */
  public withMetadata(metadata: ExceptionMetadata): CustomException {
    return new CustomException(this.message, {
      code: this.code,
      statusCode: this.statusCode,
      metadata: { ...this.metadata, ...metadata },
      cause: this.cause,
      timestamp: this.timestamp,
    });
  }
}

/**
 * ValidationException - For data validation errors
 */
export class ValidationException extends CustomException {
  constructor(
    message: string,
    field?: string,
    value?: any,
    options: Omit<ExceptionOptions, "code" | "statusCode"> = {},
  ) {
    const metadata = {
      field,
      value,
      ...options.metadata,
    };

    super(message, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      metadata,
      ...options,
    });

    Object.setPrototypeOf(this, ValidationException.prototype);
  }
}

/**
 * NotFoundException - For resource not found errors
 */
export class NotFoundException extends CustomException {
  constructor(
    message: string,
    resource?: string,
    identifier?: any,
    options: Omit<ExceptionOptions, "code" | "statusCode"> = {},
  ) {
    const metadata = {
      resource,
      identifier,
      ...options.metadata,
    };

    super(message, {
      code: "NOT_FOUND",
      statusCode: 404,
      metadata,
      ...options,
    });

    Object.setPrototypeOf(this, NotFoundException.prototype);
  }
}

/**
 * UnauthorizedException - For authentication/authorization errors
 */
export class UnauthorizedException extends CustomException {
  constructor(
    message: string = "Unauthorized access",
    options: Omit<ExceptionOptions, "code" | "statusCode"> = {},
  ) {
    super(message, {
      code: "UNAUTHORIZED",
      statusCode: 401,
      ...options,
    });

    Object.setPrototypeOf(this, UnauthorizedException.prototype);
  }
}

/**
 * ForbiddenException - For permission denied errors
 */
export class ForbiddenException extends CustomException {
  constructor(
    message: string = "Access forbidden",
    resource?: string,
    action?: string,
    options: Omit<ExceptionOptions, "code" | "statusCode"> = {},
  ) {
    const metadata = {
      resource,
      action,
      ...options.metadata,
    };

    super(message, {
      code: "FORBIDDEN",
      statusCode: 403,
      metadata,
      ...options,
    });

    Object.setPrototypeOf(this, ForbiddenException.prototype);
  }
}

/**
 * ConflictException - For resource conflicts (e.g., duplicate entries)
 */
export class ConflictException extends CustomException {
  constructor(
    message: string,
    resource?: string,
    conflictField?: string,
    options: Omit<ExceptionOptions, "code" | "statusCode"> = {},
  ) {
    const metadata = {
      resource,
      conflictField,
      ...options.metadata,
    };

    super(message, {
      code: "CONFLICT",
      statusCode: 409,
      metadata,
      ...options,
    });

    Object.setPrototypeOf(this, ConflictException.prototype);
  }
}

/**
 * BusinessLogicException - For business rule violations
 */
export class BusinessLogicException extends CustomException {
  constructor(
    message: string,
    rule?: string,
    context?: any,
    options: Omit<ExceptionOptions, "code" | "statusCode"> = {},
  ) {
    const metadata = {
      rule,
      context,
      ...options.metadata,
    };

    super(message, {
      code: "BUSINESS_LOGIC_ERROR",
      statusCode: 422,
      metadata,
      ...options,
    });

    Object.setPrototypeOf(this, BusinessLogicException.prototype);
  }
}

/**
 * DatabaseException - For database-related errors
 */
export class DatabaseException extends CustomException {
  constructor(
    message: string,
    operation?: string,
    table?: string,
    options: Omit<ExceptionOptions, "code" | "statusCode"> = {},
  ) {
    const metadata = {
      operation,
      table,
      ...options.metadata,
    };

    super(message, {
      code: "DATABASE_ERROR",
      statusCode: 500,
      metadata,
      ...options,
    });

    Object.setPrototypeOf(this, DatabaseException.prototype);
  }
}

/**
 * ExternalServiceException - For external API/service errors
 */
export class ExternalServiceException extends CustomException {
  constructor(
    message: string,
    service?: string,
    endpoint?: string,
    options: Omit<ExceptionOptions, "code" | "statusCode"> = {},
  ) {
    const metadata = {
      service,
      endpoint,
      ...options.metadata,
    };

    super(message, {
      code: "EXTERNAL_SERVICE_ERROR",
      statusCode: 502,
      metadata,
      ...options,
    });

    Object.setPrototypeOf(this, ExternalServiceException.prototype);
  }
}

/**
 * ConfigurationException - For configuration-related errors
 */
export class ConfigurationException extends CustomException {
  constructor(
    message: string,
    configKey?: string,
    options: Omit<ExceptionOptions, "code" | "statusCode"> = {},
  ) {
    const metadata = {
      configKey,
      ...options.metadata,
    };

    super(message, {
      code: "CONFIGURATION_ERROR",
      statusCode: 500,
      metadata,
      ...options,
    });

    Object.setPrototypeOf(this, ConfigurationException.prototype);
  }
}

/**
 * Utility function to check if an error is a CustomException
 */
export function isCustomException(error: any): error is CustomException {
  return error instanceof CustomException;
}

/**
 * Utility function to create a CustomException from a standard Error
 */
export function createCustomException(
  error: Error,
  options: ExceptionOptions = {},
): CustomException {
  return new CustomException(error.message, {
    ...options,
    cause: error,
  });
}

/**
 * Exception factory for creating typed exceptions
 */
export class ExceptionFactory {
  static validation(message: string, field?: string, value?: any): ValidationException {
    return new ValidationException(message, field, value);
  }

  static notFound(message: string, resource?: string, identifier?: any): NotFoundException {
    return new NotFoundException(message, resource, identifier);
  }

  static unauthorized(message?: string): UnauthorizedException {
    return new UnauthorizedException(message);
  }

  static forbidden(message?: string, resource?: string, action?: string): ForbiddenException {
    return new ForbiddenException(message, resource, action);
  }

  static conflict(message: string, resource?: string, conflictField?: string): ConflictException {
    return new ConflictException(message, resource, conflictField);
  }

  static businessLogic(message: string, rule?: string, context?: any): BusinessLogicException {
    return new BusinessLogicException(message, rule, context);
  }

  static database(message: string, operation?: string, table?: string): DatabaseException {
    return new DatabaseException(message, operation, table);
  }

  static externalService(
    message: string,
    service?: string,
    endpoint?: string,
  ): ExternalServiceException {
    return new ExternalServiceException(message, service, endpoint);
  }

  static configuration(message: string, configKey?: string): ConfigurationException {
    return new ConfigurationException(message, configKey);
  }
}
