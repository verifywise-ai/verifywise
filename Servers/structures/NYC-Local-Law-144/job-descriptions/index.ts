import { COMMERCIAL_AE } from "./commercialAe";
import { OPERATIONAL_HOURLY } from "./operationalHourly";
import type { JobDescription, JobDescriptionKey } from "./types";

export type {
  ExpectedCriterion,
  JobDescription,
  JobDescriptionKey,
  QualificationTier,
} from "./types";

export const JOB_DESCRIPTIONS: Record<JobDescriptionKey, JobDescription> = {
  "commercial-ae": COMMERCIAL_AE,
  "operational-hourly": OPERATIONAL_HOURLY,
};

export const JOB_DESCRIPTION_KEYS = Object.keys(JOB_DESCRIPTIONS) as readonly JobDescriptionKey[];

/**
 * The job description for a stored or requested key; undefined for any other
 * string, including inherited names such as "constructor". (Object.hasOwn is
 * ES2022; the server compiles against an older lib.)
 */
export function findJobDescription(key: string): JobDescription | undefined {
  return Object.prototype.hasOwnProperty.call(JOB_DESCRIPTIONS, key)
    ? (JOB_DESCRIPTIONS as Record<string, JobDescription>)[key]
    : undefined;
}
