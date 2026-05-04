/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @fileoverview This module provides a set of network services for making HTTP requests using CustomAxios.
 * It includes utility functions for logging requests and responses, as well as error handling.
 * The available HTTP methods are GET, POST, PATCH, and DELETE.
 *
 * @module networkServices
 */

import CustomAxios from "./customAxios";
import CustomException from "../exceptions/customeException";
import axios, { AxiosResponseHeaders } from "axios";

// Define types for request parameters and response data
interface RequestParams {
  [key: string]: any;
}

interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers?: AxiosResponseHeaders;
}

// Utility function to handle errors
const handleError = (error: any) => {
  try {
    if (axios.isAxiosError(error)) {
      // Extract the most specific error message available
      let errorMessage = error.message; // fallback

      if (error.response?.data?.data && typeof error.response.data.data === "string") {
        // Validation errors from STATUS_CODE[400] put the specific message in data.data
        errorMessage = error.response.data.data;
      } else if (error.response?.data?.message) {
        // Standard error format with message
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        // Alternative error format
        errorMessage = error.response.data.error;
      }

      return new CustomException(errorMessage, error.response?.status, error.response?.data);
    } else {
      return new CustomException(
        error.message || "An unknown error occurred",
        undefined,
        undefined,
      );
    }
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error in handleError:", e);
    }
    throw e;
  }
};

// Logging function - only logs in development mode
const logRequest = (method: string, endpoint: string, params?: any, data?: any) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`[API Request] ${method.toUpperCase()} ${endpoint}`, {
      params,
      data,
    });
  }
};

const logResponse = (method: string, endpoint: string, response: any) => {
  if (process.env.NODE_ENV === "development") {
    console.table(
      `[API Response] ${method.toUpperCase()} ${endpoint} ${response.data.message}`,
      response.status,
    );
  }
};

export const apiServices = {
  /**
   * Makes a GET request to the specified endpoint with optional query parameters.
   *
   * @template T - The type of the response data.
   * @param {string} endpoint - The API endpoint to send the request to.
   * @param {RequestParams} [params={}] - Optional query parameters to include in the request.
   * @returns {Promise<ApiResponse<T>>} - A promise that resolves to the API response.
   */
  async get<T>(endpoint: string, params: RequestParams = {}): Promise<ApiResponse<T>> {
    // Extract special config options that should not be query params
    const { signal, responseType, ...queryParams } = params;

    logRequest("get", endpoint, queryParams);
    try {
      const response = await CustomAxios.get(endpoint, {
        params: queryParams,
        responseType: responseType ?? "json",
        signal,
      });

      logResponse("get", endpoint, response);
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      const requestedAPIError = handleError(error);
      throw requestedAPIError;
    }
  },

  /**
   * Makes a POST request to the specified endpoint with optional data payload.
   *
   * @template T - The type of the response data.
   * @param {string} endpoint - The API endpoint to send the request to.
   * @param {any} [data={}] - Optional data payload to include in the request.
   * @param {RequestParams} [config={}] - Optional configuration for the request.
   * @returns {Promise<ApiResponse<T>>} - A promise that resolves to the API response.
   */
  async post<T>(
    endpoint: string,
    data: any = {},
    config: RequestParams = {},
  ): Promise<ApiResponse<T>> {
    logRequest("post", endpoint, undefined, data);
    try {
      const response = await CustomAxios.post(endpoint, data, config);
      logResponse("post", endpoint, response);
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers as AxiosResponseHeaders,
      };
    } catch (error) {
      const requestedAPIError = handleError(error);
      throw requestedAPIError;
    }
  },

  /**
   * Makes a PATCH request to the specified endpoint with optional data payload.
   *
   * @template T - The type of the response data.
   * @param {string} endpoint - The API endpoint to send the request to.
   * @param {any} [data={}] - Optional data payload to include in the request.
   * @param {RequestParams} [config={}] - Optional configuration for the request.
   * @returns {Promise<ApiResponse<T>>} - A promise that resolves to the API response.
   */
  async patch<T>(
    endpoint: string,
    data: any = {},
    config: RequestParams = {},
  ): Promise<ApiResponse<T>> {
    logRequest("patch", endpoint, undefined, data);
    try {
      const response = await CustomAxios.patch(endpoint, data, config);
      logResponse("patch", endpoint, response);
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      const requestedAPIError = handleError(error);
      throw requestedAPIError;
    }
  },

  /**
   * Makes a PUT request to the specified endpoint with optional data payload.
   *
   * @template T - The type of the response data.
   * @param {string} endpoint - The API endpoint to send the request to.
   * @param {any} [data={}] - Optional data payload to include in the request.
   * @param {RequestParams} [config={}] - Optional configuration for the request.
   * @returns {Promise<ApiResponse<T>>} - A promise that resolves to the API response.
   */
  async put<T>(
    endpoint: string,
    data: any = {},
    config: RequestParams = {},
  ): Promise<ApiResponse<T>> {
    logRequest("put", endpoint, undefined, data);
    try {
      const response = await CustomAxios.put(endpoint, data, config);
      logResponse("put", endpoint, response);
      return {
        data: response.data,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      const requestedAPIError = handleError(error);
      throw requestedAPIError;
    }
  },

  /**
   * Makes a DELETE request to the specified endpoint.
   *
   * @template T - The type of the response data.
   * @param {string} endpoint - The API endpoint to send the request to.
   * @param {RequestParams} [config={}] - Optional configuration for the request.
   * @returns {Promise<ApiResponse<T>>} - A promise that resolves to the API response.
   */
  async delete<T>(endpoint: string, config: RequestParams = {}): Promise<ApiResponse<T>> {
    logRequest("delete", endpoint);
    try {
      const response = await CustomAxios.delete(endpoint, config);
      logResponse("delete", endpoint, response);
      return {
        data: response.data.data,
        status: response.status,
        statusText: response.data.message,
      };
    } catch (error) {
      const requestedAPIError = handleError(error);
      throw requestedAPIError;
    }
  },
};
