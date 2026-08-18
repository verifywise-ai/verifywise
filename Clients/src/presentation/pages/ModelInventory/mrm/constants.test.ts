import { describe, it, expect } from "vitest";
import {
  tierLabel,
  tierChipVariant,
  validationStageChipVariant,
  findingSeverityChipVariant,
  findingStageChipVariant,
  evalStatusLabel,
  evalStatusChipVariant,
  thresholdOpLabel,
  thresholdOpSymbol,
  thresholdSummary,
  thresholdSeverityLabel,
  thresholdSeverityChipVariant,
  breachActionLabel,
  findMatchingThreshold,
  mrmErrorMessage,
  fleetModelName,
  validationTriggerLabel,
  revalidationTriggerSourceLabel,
  attestationStatusLabel,
  attestationStatusChipVariant,
  FINDING_STAGE_OPTIONS,
} from "./constants";
import {
  MrmAttestationStatus,
  MrmBreachAction,
  MrmEvalStatus,
  MrmFindingSeverity,
  MrmFindingStage,
  MrmRevalidationTriggerSource,
  MrmThresholdOp,
  MrmThresholdSeverity,
  MrmTier,
  MrmValidationStage,
  MrmValidationTrigger,
} from "../../../../domain/enums/mrm.enum";
import { IMrmThreshold } from "../../../../domain/interfaces/i.mrm";

describe("mrm constants helpers", () => {
  describe("tierLabel / tierChipVariant", () => {
    it("labels every tier and null", () => {
      expect(tierLabel(MrmTier.TIER_1)).toBe("Tier 1");
      expect(tierLabel(MrmTier.TIER_2)).toBe("Tier 2");
      expect(tierLabel(MrmTier.TIER_3)).toBe("Tier 3");
      expect(tierLabel(null)).toBe("Untiered");
    });

    it("maps chip variants per tier", () => {
      expect(tierChipVariant(MrmTier.TIER_1)).toBe("critical");
      expect(tierChipVariant(MrmTier.TIER_2)).toBe("warning");
      expect(tierChipVariant(MrmTier.TIER_3)).toBe("success");
      expect(tierChipVariant(null)).toBe("default");
    });
  });

  describe("validationStageChipVariant", () => {
    it("maps every stage", () => {
      expect(validationStageChipVariant(MrmValidationStage.VALIDATED)).toBe("success");
      expect(validationStageChipVariant(MrmValidationStage.UNDER_REVIEW)).toBe("info");
      expect(validationStageChipVariant(MrmValidationStage.IN_VALIDATION)).toBe("warning");
      expect(validationStageChipVariant(MrmValidationStage.NOT_STARTED)).toBe("default");
    });
  });

  describe("findingSeverityChipVariant", () => {
    it("maps every severity", () => {
      expect(findingSeverityChipVariant(MrmFindingSeverity.CRITICAL)).toBe("critical");
      expect(findingSeverityChipVariant(MrmFindingSeverity.HIGH)).toBe("high");
      expect(findingSeverityChipVariant(MrmFindingSeverity.MEDIUM)).toBe("medium");
      expect(findingSeverityChipVariant(MrmFindingSeverity.LOW)).toBe("low");
    });
  });

  describe("findingStageChipVariant", () => {
    it("maps every stage", () => {
      expect(findingStageChipVariant(MrmFindingStage.OPEN)).toBe("error");
      expect(findingStageChipVariant(MrmFindingStage.REMEDIATION_PLANNED)).toBe("info");
      expect(findingStageChipVariant(MrmFindingStage.IN_PROGRESS)).toBe("warning");
      expect(findingStageChipVariant(MrmFindingStage.RESOLVED)).toBe("success");
      expect(findingStageChipVariant(MrmFindingStage.CLOSED)).toBe("default");
    });

    it("derives FINDING_STAGE_OPTIONS from the ordered stage list", () => {
      expect(FINDING_STAGE_OPTIONS).toHaveLength(5);
      expect(FINDING_STAGE_OPTIONS[0]).toEqual({ value: MrmFindingStage.OPEN, label: "Open" });
    });
  });

  describe("evalStatusLabel / evalStatusChipVariant", () => {
    it("labels every status including null", () => {
      expect(evalStatusLabel(MrmEvalStatus.OK)).toBe("Within threshold");
      expect(evalStatusLabel(MrmEvalStatus.WARN)).toBe("Warning");
      expect(evalStatusLabel(MrmEvalStatus.BREACH)).toBe("Breach");
      expect(evalStatusLabel(MrmEvalStatus.NO_THRESHOLD)).toBe("No threshold defined");
      expect(evalStatusLabel(null)).toBe("No data yet");
    });

    it("maps chip variants", () => {
      expect(evalStatusChipVariant(MrmEvalStatus.OK)).toBe("success");
      expect(evalStatusChipVariant(MrmEvalStatus.WARN)).toBe("warning");
      expect(evalStatusChipVariant(MrmEvalStatus.BREACH)).toBe("error");
      expect(evalStatusChipVariant(MrmEvalStatus.NO_THRESHOLD)).toBe("default");
      expect(evalStatusChipVariant(null)).toBe("default");
    });
  });

  describe("threshold helpers", () => {
    it("labels and symbols every op", () => {
      expect(thresholdOpLabel(MrmThresholdOp.GTE)).toBe("Floor (≥)");
      expect(thresholdOpLabel("unknown" as MrmThresholdOp)).toBe("unknown");
      expect(thresholdOpSymbol(MrmThresholdOp.GTE)).toBe("≥");
      expect(thresholdOpSymbol(MrmThresholdOp.GT)).toBe(">");
      expect(thresholdOpSymbol(MrmThresholdOp.LTE)).toBe("≤");
      expect(thresholdOpSymbol(MrmThresholdOp.LT)).toBe("<");
      expect(thresholdOpSymbol(MrmThresholdOp.OUTSIDE)).toBe("");
    });

    it("summarises a band threshold", () => {
      expect(
        thresholdSummary({ op: MrmThresholdOp.OUTSIDE, value_lo: 0.1, value_hi: 0.2 }),
      ).toBe("outside 0.1–0.2");
      expect(thresholdSummary({ op: MrmThresholdOp.OUTSIDE })).toBe("band");
    });

    it("summarises a scalar threshold", () => {
      expect(thresholdSummary({ op: MrmThresholdOp.GTE, value_num: 0.68 })).toBe("≥ 0.68");
      expect(thresholdSummary({ op: MrmThresholdOp.GTE })).toBe("≥");
    });

    it("labels threshold severity and its chip variant", () => {
      expect(thresholdSeverityLabel(MrmThresholdSeverity.WARN)).toBe("Warning");
      expect(thresholdSeverityChipVariant(MrmThresholdSeverity.CRITICAL)).toBe("critical");
      expect(thresholdSeverityChipVariant(MrmThresholdSeverity.HIGH)).toBe("high");
      expect(thresholdSeverityChipVariant(MrmThresholdSeverity.WARN)).toBe("warning");
    });

    it("labels breach actions, falling back to the raw value for unknowns", () => {
      expect(breachActionLabel(MrmBreachAction.NOTIFY)).toBe("Notify only");
      expect(breachActionLabel("unknown" as MrmBreachAction)).toBe("unknown");
    });

    it("finds a matching active threshold by metric/segment/window", () => {
      const thresholds: IMrmThreshold[] = [
        {
          id: 1,
          organization_id: 1,
          model_inventory_id: 1,
          metric: "psi",
          segment: "overall",
          window: "daily",
          op: MrmThresholdOp.GTE,
          value_num: 0.2,
          severity: MrmThresholdSeverity.WARN,
          breach_action: MrmBreachAction.NOTIFY,
          active: true,
        },
        {
          id: 2,
          organization_id: 1,
          model_inventory_id: 1,
          metric: "psi",
          segment: null,
          window: null,
          op: MrmThresholdOp.GTE,
          value_num: 0.3,
          severity: MrmThresholdSeverity.WARN,
          breach_action: MrmBreachAction.NOTIFY,
          active: false,
        },
      ];
      const match = findMatchingThreshold(thresholds, "psi", "overall", "daily");
      expect(match?.id).toBe(1);
      expect(findMatchingThreshold(thresholds, "auc", "overall", "daily")).toBeUndefined();
    });
  });

  describe("mrmErrorMessage", () => {
    it("prefers response.data.message", () => {
      const error = { response: { data: { message: "nope" } } };
      expect(mrmErrorMessage(error, "fallback")).toBe("nope");
    });

    it("falls back to response.data.error then the provided fallback", () => {
      expect(mrmErrorMessage({ response: { data: { error: "bad" } } }, "fallback")).toBe("bad");
      expect(mrmErrorMessage({}, "fallback")).toBe("fallback");
      expect(mrmErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
    });
  });

  describe("fleetModelName", () => {
    it("joins provider and model, appending version", () => {
      expect(fleetModelName({ provider: "OpenAI", model: "GPT-4", version: "1.0" })).toBe(
        "OpenAI · GPT-4 (v1.0)",
      );
    });

    it("degrades gracefully with missing fields", () => {
      expect(fleetModelName({ provider: "OpenAI", model: null })).toBe("OpenAI");
      expect(fleetModelName({ provider: null, model: null })).toBe("Unnamed model");
    });
  });

  describe("trigger + attestation labels", () => {
    it("labels validation triggers, falling back to the raw value", () => {
      expect(validationTriggerLabel(MrmValidationTrigger.BREACH)).toBe("Breach");
      expect(validationTriggerLabel("weird" as MrmValidationTrigger)).toBe("weird");
    });

    it("labels revalidation trigger sources", () => {
      expect(revalidationTriggerSourceLabel(MrmRevalidationTriggerSource.TIER_INCREASE)).toBe(
        "Tier increase",
      );
    });

    it("labels attestation status and maps chip variant", () => {
      expect(attestationStatusLabel(MrmAttestationStatus.OK)).toBe("Ready");
      expect(attestationStatusLabel(MrmAttestationStatus.BLOCKED)).toBe("Blocked");
      expect(attestationStatusChipVariant(MrmAttestationStatus.BLOCKED)).toBe("warning");
      expect(attestationStatusChipVariant(MrmAttestationStatus.OK)).toBe("success");
    });
  });
});
