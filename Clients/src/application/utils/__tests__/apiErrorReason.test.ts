import { describe, expect, it } from "vitest";
import {
  getApiErrorReason,
  getApiValidationMessage,
  getClientErrorReason,
  getGatewayErrorDetail,
  getGatewayErrorText,
  isClientError,
} from "../apiErrorReason";
import CustomException from "../../../infrastructure/exceptions/customeException";

describe("getApiErrorReason", () => {
  it("reads the 5xx reason from `error`", () => {
    expect(
      getApiErrorReason({
        response: { message: "Bad Gateway", error: "Failed to fetch runs: HTTP 403" },
      }),
    ).toBe("Failed to fetch runs: HTTP 403");
  });

  it("reads the 4xx reason from `data`", () => {
    expect(
      getApiErrorReason({
        response: { message: "Bad Request", data: "MLflow is not configured." },
      }),
    ).toBe("MLflow is not configured.");
  });

  it("ignores the generic status text and non-string payloads", () => {
    expect(getApiErrorReason({ response: { message: "OK", data: { success: false } } })).toBeNull();
    expect(getApiErrorReason(new Error("network down"))).toBeNull();
    expect(getApiErrorReason(null)).toBeNull();
  });
});

/**
 * Builds the exception the way networkServices.handleError does: the message
 * is the reason it extracted from the envelope (or the HTTP status phrase, or
 * axios' own message when there is no body).
 */
const apiError = (message: string, status: number | undefined, body?: unknown) =>
  new CustomException(message, status, body);

describe("getClientErrorReason", () => {
  it("returns the reason handleError extracted for a 4xx", () => {
    // STATUS_CODE[400]("msg")
    expect(
      getClientErrorReason(
        apiError("LLM key not found", 400, { message: "Bad Request", data: "LLM key not found" }),
      ),
    ).toBe("LLM key not found");
    // STATUS_CODE[404]({ message })
    expect(
      getClientErrorReason(
        apiError("Intake form not found", 404, {
          message: "Not Found",
          data: { message: "Intake form not found" },
        }),
      ),
    ).toBe("Intake form not found");
    // legacy { error }
    expect(getClientErrorReason(apiError("Slug taken", 409, { error: "Slug taken" }))).toBe(
      "Slug taken",
    );
  });

  it.each([
    ["Bad Request", 400],
    ["Not Found", 404],
    ["Payload Too Large", 413],
    ["Too Many Requests", 429],
    ["Request failed with status code 422", 422],
    ["", 400],
    ["   ", 400],
  ])("is null when the message is only generic (%p)", (message, status) => {
    expect(getClientErrorReason(apiError(message, status, { message }))).toBeNull();
  });

  it("never returns the text of a 5xx", () => {
    expect(
      getClientErrorReason(
        apiError("relation does not exist", 500, {
          message: "Internal Server Error",
          error: "relation does not exist",
        }),
      ),
    ).toBeNull();
  });

  it("is null for a network error or anything that is not an API error", () => {
    expect(getClientErrorReason(apiError("Network Error", undefined))).toBeNull();
    expect(getClientErrorReason(new Error("boom"))).toBeNull();
    expect(getClientErrorReason({ status: 400, message: "not a CustomException" })).toBeNull();
    expect(getClientErrorReason(null)).toBeNull();
  });
});

describe("isClientError", () => {
  it("is true only for an API error with a 4xx status", () => {
    expect(isClientError(apiError("x", 400))).toBe(true);
    expect(isClientError(apiError("x", 499))).toBe(true);
    expect(isClientError(apiError("x", 500))).toBe(false);
    expect(isClientError(apiError("x", undefined))).toBe(false);
    expect(isClientError(new Error("x"))).toBe(false);
  });
});

describe("getGatewayErrorDetail", () => {
  const gatewayError = (status: number, detail: unknown) =>
    apiError("Request failed", status, { detail });

  it("reads the gateway's { detail } reason of a 4xx", () => {
    expect(getGatewayErrorDetail(gatewayError(422, "log_retention_days must be an integer"))).toBe(
      "log_retention_days must be an integer",
    );
  });

  it("reads the message of an object detail ({ message, code }) of a 4xx", () => {
    expect(
      getGatewayErrorDetail(
        gatewayError(409, { message: "Key name already in use", code: "duplicate_key_name" }),
      ),
    ).toBe("Key name already in use");
    expect(getGatewayErrorDetail(gatewayError(400, { code: "x" }))).toBeNull();
    expect(getGatewayErrorDetail(gatewayError(400, { message: "" }))).toBeNull();
  });

  it("never surfaces the detail of a 5xx, string or object", () => {
    expect(getGatewayErrorDetail(gatewayError(500, "Failed: connection refused"))).toBeNull();
    expect(
      getGatewayErrorDetail(gatewayError(503, { message: "Internal key not configured" })),
    ).toBeNull();
  });

  it("returns null when there is no string detail", () => {
    expect(getGatewayErrorDetail(gatewayError(422, [{ loc: [] }]))).toBeNull();
    expect(getGatewayErrorDetail(gatewayError(400, ""))).toBeNull();
    expect(getGatewayErrorDetail(new Error("network"))).toBeNull();
    expect(getGatewayErrorDetail(null)).toBeNull();
  });
});

describe("getApiValidationMessage", () => {
  const validation400 = (errors: unknown) =>
    new CustomException("Incident creation validation failed", 400, {
      message: "Bad Request",
      data: { status: "error", message: "Incident creation validation failed", errors },
    });

  const fields = {
    passThrough: ["description"],
    replace: { project_id: "The selected use case is no longer available." },
  };

  it("shows pass-through field messages as sent", () => {
    expect(
      getApiValidationMessage(
        validation400([
          {
            field: "description",
            message: "Description cannot exceed 32,767 characters.",
            code: "MAX_LENGTH",
          },
        ]),
        fields,
      ),
    ).toBe("Description cannot exceed 32,767 characters.");
  });

  it("replaces messages for fields that name internals", () => {
    expect(
      getApiValidationMessage(
        validation400([
          {
            field: "project_id",
            message: "project_id does not reference an entity in your organization",
            code: "INVALID_REFERENCE",
          },
          { field: "description", message: "Description is required." },
        ]),
        fields,
      ),
    ).toBe("The selected use case is no longer available. Description is required.");
  });

  it("skips fields that are not listed, and returns null when nothing is left", () => {
    const unlisted = validation400([
      { field: "assignee_id", message: "assignee_id does not reference an entity" },
    ]);
    expect(getApiValidationMessage(unlisted, fields)).toBeNull();
    expect(
      getApiValidationMessage(
        validation400([
          { field: "assignee_id", message: "assignee_id must be a positive integer" },
          { field: "description", message: "Description is required." },
        ]),
        fields,
      ),
    ).toBe("Description is required.");
  });

  it("falls back to the general 4xx reason when there are no field errors", () => {
    expect(getApiValidationMessage(validation400([]), fields)).toBe(
      "Incident creation validation failed",
    );
    expect(
      getApiValidationMessage(new CustomException("Incident not found", 404, {}), fields),
    ).toBe("Incident not found");
  });

  it("returns null for 5xx and non-API errors", () => {
    expect(
      getApiValidationMessage(
        new CustomException("database exploded", 500, { error: "x" }),
        fields,
      ),
    ).toBeNull();
    expect(getApiValidationMessage(new Error("network down"), fields)).toBeNull();
    expect(getApiValidationMessage(null, fields)).toBeNull();
  });
});

describe("getGatewayErrorText", () => {
  it("prefers a string detail", () => {
    const err = new CustomException("Bad Request", 400, { detail: "Slug already taken" });
    expect(getGatewayErrorText(err, "fallback")).toBe("Slug already taken");
  });

  it("reads detail.message", () => {
    const err = new CustomException("Bad Request", 400, {
      detail: { message: "Budget exceeded", code: "budget" },
    });
    expect(getGatewayErrorText(err, "fallback")).toBe("Budget exceeded");
  });

  it("falls back to the 4xx envelope reason", () => {
    const err = new CustomException("Name is required", 400, {});
    expect(getGatewayErrorText(err, "fallback")).toBe("Name is required");
  });

  it("returns the fallback for generic 4xx status text", () => {
    const err = new CustomException("Bad Request", 400, {});
    expect(getGatewayErrorText(err, "fallback")).toBe("fallback");
  });

  it("never shows a 5xx detail or reason", () => {
    const err = new CustomException("database exploded", 500, { detail: "internal trace" });
    expect(getGatewayErrorText(err, "fallback")).toBe("fallback");
  });

  it("returns the fallback for non-API errors", () => {
    expect(getGatewayErrorText(new Error("boom"), "fallback")).toBe("fallback");
    expect(getGatewayErrorText({ response: { data: { detail: "x" } } }, "fallback")).toBe(
      "fallback",
    );
  });
});

describe("getGatewayErrorDetail for validation responses", () => {
  it("joins the messages of a 422 validation list, without Pydantic's prefix", () => {
    const err = new CustomException("Request failed with status code 422", 422, {
      detail: [
        {
          loc: ["body", "slug"],
          msg: "Value error, slug must be at least 2 characters",
          type: "value_error",
        },
        { loc: ["body", "name"], msg: "Field required", type: "missing" },
      ],
    });
    expect(getGatewayErrorDetail(err)).toBe("slug must be at least 2 characters Field required");
  });

  it("ignores a 422 list without usable messages", () => {
    const err = new CustomException("Request failed with status code 422", 422, {
      detail: [{ loc: [] }],
    });
    expect(getGatewayErrorText(err, "fallback")).toBe("fallback");
  });
});

describe("gateway 401 (internal key misconfiguration)", () => {
  it("is never shown, whether the reason is in detail or in the error message", () => {
    const inDetail = new CustomException("Unauthorized", 401, {
      detail: { message: "Invalid internal key", code: "internal_key_rejected" },
    });
    const inMessage = new CustomException("Invalid internal key", 401, {
      message: "Invalid internal key",
    });
    expect(getGatewayErrorDetail(inDetail)).toBeNull();
    expect(getGatewayErrorText(inDetail, "fallback")).toBe("fallback");
    expect(getGatewayErrorText(inMessage, "fallback")).toBe("fallback");
  });
});
