import { FormValues } from "./constants";

/** Request body fields the form edits under another name. */
const BODY_FIELD_TO_FORM_FIELD: Partial<Record<string, keyof FormValues>> = {
  // The chosen regulations are sent as `framework`.
  framework: "monitored_regulations_and_standards",
};

/** Form fields that show an error under their input. */
const FIELDS_WITH_ERRORS: ReadonlySet<string> = new Set<keyof FormValues>([
  "project_title",
  "owner",
  "external_owner_name",
  "external_owner_email",
  "members",
  "start_date",
  "ai_risk_classification",
  "status",
  "high_risk_roles",
  "goal",
  "monitored_regulations_and_standards",
  "geography",
  "target_industry",
  "description",
  "approval_workflow_id",
  "use_case_category",
  "use_case_purpose",
  "use_case_audience",
  "deployment_context",
]);

/**
 * Split a 400's `errors` list into errors shown on their field and messages
 * shown above the form. An error on a field the form has no input for would
 * otherwise be shown nowhere.
 */
export function splitServerErrors(serverErrors: unknown): {
  fieldErrors: Partial<Record<keyof FormValues, string>>;
  formMessages: string[];
} {
  const fieldErrors: Partial<Record<keyof FormValues, string>> = {};
  const formMessages: string[] = [];
  if (!Array.isArray(serverErrors)) return { fieldErrors, formMessages };
  for (const serverError of serverErrors) {
    if (
      !serverError ||
      typeof serverError.field !== "string" ||
      typeof serverError.message !== "string"
    ) {
      continue;
    }
    const field = BODY_FIELD_TO_FORM_FIELD[serverError.field] ?? serverError.field;
    if (FIELDS_WITH_ERRORS.has(field)) {
      fieldErrors[field as keyof FormValues] = serverError.message;
    } else {
      formMessages.push(serverError.message);
    }
  }
  return { fieldErrors, formMessages };
}
