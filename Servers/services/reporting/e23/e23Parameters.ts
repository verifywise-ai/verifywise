/**
 * @fileoverview Parameter fields for the OSFI E-23 completeness report.
 *
 * A report of kind "osfi_e23" asks the user for these values before it runs.
 * The keys are the contract with stored schedules; labels are presentation.
 *
 * @module services/reporting/e23/e23Parameters
 */

import { ReportParameterField } from "../../../domain.layer/interfaces/i.reportTemplate";

export const E23_KIND = "osfi_e23";

export const E23_PARAMETER_FIELDS: ReportParameterField[] = [
  { key: "periodStart", label: "Period start", type: "date", required: true },
  { key: "periodEnd", label: "Period end", type: "date", required: true },
  {
    key: "institutionName",
    label: "Institution name",
    type: "text",
    required: true,
    maxLength: 200,
  },
  {
    key: "accountableExecutiveName",
    label: "Accountable executive name",
    type: "text",
    required: true,
    maxLength: 200,
  },
  {
    key: "accountableExecutiveTitle",
    label: "Accountable executive title",
    type: "text",
    required: true,
    maxLength: 200,
  },
  {
    key: "headOfValidationName",
    label: "Head of validation name",
    type: "text",
    required: false,
    maxLength: 200,
  },
  {
    key: "headOfValidationTitle",
    label: "Head of validation title",
    type: "text",
    required: false,
    maxLength: 200,
  },
  {
    key: "preparedByName",
    label: "Prepared by name",
    type: "text",
    required: true,
    maxLength: 200,
  },
  {
    key: "preparedByTitle",
    label: "Prepared by title",
    type: "text",
    required: true,
    maxLength: 200,
  },
  {
    key: "audience",
    label: "Audience",
    type: "select",
    required: true,
    options: [
      { value: "osfi", label: "OSFI supervisory review" },
      { value: "board", label: "Board of directors" },
    ],
  },
  { key: "scopeNote", label: "Scope note", type: "textarea", required: false, maxLength: 1000 },
  { key: "isFinal", label: "Final version", type: "boolean", required: false },
];
