import { body, param, query } from "express-validator";
import { handleValidationErrors } from "../validate.middleware";

const domainParam = param("domain")
  .isString()
  .trim()
  .isLength({ min: 1, max: 64 })
  .withMessage("domain must be a non-empty string");

const idParam = param("id").isInt({ min: 1 }).withMessage("id must be a positive integer");

const agentNameParam = param("agentName")
  .isString()
  .trim()
  .isLength({ min: 1, max: 128 })
  .withMessage("agentName must be a non-empty string");

export const validateRunAdvisor = [
  body("prompt").isString().trim().notEmpty().withMessage("prompt is required"),
  body("sessionId").optional({ nullable: true }).isString(),
  handleValidationErrors,
];

export const validateStreamAdvisorV2 = [
  // Aligned with controller, which does `req.body.messages || []` — the
  // AI SDK is normally guaranteed to send the user submission, but the
  // backend already tolerates an empty array on the cold-start probe, so
  // don't reject it at the validator layer.
  body("messages").isArray().withMessage("messages must be an array"),
  body("llmKeyId").optional({ nullable: true }).isInt({ min: 1 }),
  handleValidationErrors,
];

export const validateDomainParam = [domainParam, handleValidationErrors];

export const validateConversationParams = [domainParam, idParam, handleValidationErrors];

export const validateUpdateConversation = [
  domainParam,
  idParam,
  body("messages").isArray().withMessage("messages must be an array"),
  handleValidationErrors,
];

export const validateMemoryQuery = [
  query("agentName").optional({ nullable: true }).isString(),
  query("sessionId").optional({ nullable: true }).isString(),
  handleValidationErrors,
];

export const validateAdminAgentParam = [
  agentNameParam,
  query("limit").optional().isInt({ min: 1, max: 500 }),
  handleValidationErrors,
];
