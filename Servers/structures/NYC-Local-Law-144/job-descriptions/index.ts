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

export const JOB_DESCRIPTION_KEYS = Object.keys(JOB_DESCRIPTIONS) as JobDescriptionKey[];
