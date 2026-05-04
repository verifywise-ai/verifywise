/**
 * Controller Wrapper Utility
 *
 * Provides a reusable wrapper function for Express controllers that standardizes:
 * - Request/response logging (processing, success, failure)
 * - Error handling with support for custom exceptions
 * - Response formatting using STATUS_CODE utilities
 *
 * This utility reduces boilerplate in controllers by extracting common patterns
 * into a single, configurable wrapper function.
 *
 * @module controllerWrapper
 * @see {@link ../domain.layer/exceptions/custom.exception.ts} for exception types
 * @see {@link ./statusCode.utils.ts} for response formatting
 */

import { Request, Response } from "express";
import { STATUS_CODE } from "./statusCode.utils";
import { logFailure, logProcessing, logSuccess } from "./logger/logHelper";
import { isCustomException } from "../domain.layer/exceptions/custom.exception";

/**
 * Event types for audit logging.
 * Maps to CRUD operations for consistent logging across the application.
 */
export type EventType = "Create" | "Read" | "Update" | "Delete";

/**
 * Configuration options for the controller wrapper.
 *
 * @template T - The type of data returned by the controller
 */
export interface ControllerOptions<T> {
  /** Name of the function for logging (e.g., "getAllVendors") */
  functionName: string;
  /** Source file name for logging (e.g., "vendor.ctrl.ts") */
  fileName: string;
  /** Event type for audit logging - maps to CRUD operations */
  eventType: EventType;
  /** Custom description for the processing log entry (defaults to "starting {functionName}") */
  processingDescription?: string;
  /**
   * Description for success log entry.
   * Can be a static string or a function that receives the result for dynamic messages.
   * Defaults to "{functionName} completed successfully"
   */
  successDescription?: string | ((result: T | undefined) => string);
  /** Custom description for failure log entry (defaults to "{functionName} failed") */
  failureDescription?: string;
}

/**
 * Supported HTTP status codes for controller responses.
 *
 * These codes align with the STATUS_CODE utility class and custom exception types:
 * - 200: OK - Successful request with data
 * - 201: Created - Resource successfully created
 * - 202: Accepted - Request accepted for processing
 * - 204: No Content - Successful request with no data to return
 * - 400: Bad Request - ValidationException
 * - 401: Unauthorized - UnauthorizedException
 * - 403: Forbidden - ForbiddenException
 * - 404: Not Found - NotFoundException
 * - 409: Conflict - ConflictException
 * - 422: Unprocessable Entity - BusinessLogicException
 * - 500: Internal Server Error - DatabaseException, ConfigurationException, or unhandled errors
 * - 502: Bad Gateway - ExternalServiceException
 */
export type HttpStatusCode = 200 | 201 | 202 | 204 | 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502;

/**
 * Return type for controller handler functions.
 *
 * @template T - The type of data being returned
 */
export interface ControllerResult<T> {
  /** HTTP status code to return */
  status: HttpStatusCode;
  /** Response data (optional for 204 No Content responses) */
  data?: T;
}

/**
 * Wraps controller logic with standardized logging, error handling, and response formatting.
 *
 * This wrapper provides:
 * - Automatic processing/success/failure logging
 * - Custom exception handling with appropriate HTTP status codes
 * - Consistent response formatting via STATUS_CODE utility
 * - Type-safe handler function with proper Request/Response types
 *
 * @template T - The type of data returned by the controller
 *
 * @param handler - Async function containing the controller logic.
 *                  Receives Express Request and Response objects.
 *                  Must return a ControllerResult with status and optional data.
 *
 * @param options - Configuration options for logging and error messages.
 *                  See {@link ControllerOptions} for available options.
 *
 * @returns Express middleware function that handles the request lifecycle
 *
 * @example
 * // Basic usage with static success message
 * export const getVendorById = controllerWrapper(
 *   async (req) => {
 *     const vendor = await getVendorByIdQuery(req.params.id, req.tenantId!);
 *     if (!vendor) {
 *       throw new NotFoundException("Vendor not found", "vendor", req.params.id);
 *     }
 *     return { status: 200, data: vendor };
 *   },
 *   {
 *     functionName: "getVendorById",
 *     fileName: "vendor.ctrl.ts",
 *     eventType: "Read",
 *     successDescription: "Vendor retrieved successfully",
 *   }
 * );
 *
 * @example
 * // Usage with dynamic success message
 * export const getAllVendors = controllerWrapper(
 *   async (req) => {
 *     const vendors = await getAllVendorsQuery(req.tenantId!);
 *     return { status: vendors?.length ? 200 : 204, data: vendors };
 *   },
 *   {
 *     functionName: "getAllVendors",
 *     fileName: "vendor.ctrl.ts",
 *     eventType: "Read",
 *     successDescription: (result) => `Retrieved ${result?.length || 0} vendors`,
 *   }
 * );
 *
 * @example
 * // Create operation with 201 status
 * export const createVendor = controllerWrapper(
 *   async (req) => {
 *     const vendor = await createVendorQuery(req.body, req.tenantId!);
 *     return { status: 201, data: vendor };
 *   },
 *   {
 *     functionName: "createVendor",
 *     fileName: "vendor.ctrl.ts",
 *     eventType: "Create",
 *     successDescription: "Vendor created successfully",
 *   }
 * );
 */
export function controllerWrapper<T>(
  handler: (req: Request, res: Response) => Promise<ControllerResult<T>>,
  options: ControllerOptions<T>,
): (req: Request, res: Response) => Promise<Response> {
  return async (req: Request, res: Response): Promise<Response> => {
    const {
      functionName,
      fileName,
      eventType,
      processingDescription,
      successDescription,
      failureDescription,
    } = options;

    // Log the start of processing
    logProcessing({
      description: processingDescription || `starting ${functionName}`,
      functionName,
      fileName,
      userId: req.userId!,
      tenantId: req.tenantId!,
    });

    try {
      const result = await handler(req, res);

      // Build success message (static or dynamic)
      const successMsg =
        typeof successDescription === "function"
          ? successDescription(result.data)
          : successDescription || `${functionName} completed successfully`;

      await logSuccess({
        eventType,
        description: successMsg,
        functionName,
        fileName,
        userId: req.userId!,
        tenantId: req.tenantId!,
      });

      return res.status(result.status).json(STATUS_CODE[result.status](result.data));
    } catch (error) {
      const err = error as Error;

      await logFailure({
        eventType,
        description: failureDescription || `${functionName} failed`,
        functionName,
        fileName,
        error: err,
        userId: req.userId!,
        tenantId: req.tenantId!,
      });

      // Handle custom exceptions with their defined status codes
      if (isCustomException(error)) {
        const statusCode = error.statusCode as HttpStatusCode;
        return res.status(statusCode).json(STATUS_CODE[statusCode](err.message));
      }

      // Default to 500 Internal Server Error for unhandled exceptions
      return res.status(500).json(STATUS_CODE[500](err.message));
    }
  };
}
