import {
  BusinessCriticality,
  DataSensitivity,
  PastIssues,
  RegulatoryExposure,
  ReviewStatus,
} from "../../../domain/enums/status.enum";
import { VendorModel } from "../../../domain/models/Common/vendor/vendor.model";
import {
  mapBusinessCriticality,
  mapDataSensitivity,
  mapPastIssues,
  mapRegulatoryExposure,
  mapReviewStatus,
  mapVendorResponseDTOsToModels,
  mapVendorResponseDTOToModel,
  mapVendorToCreateDTO,
  mapVendorToUpdateDTO,
} from "../vendor.mapper";
import { VendorDTOBuilder, VendorModelBuilder } from "./mocks/vendor.mappers.mocks";

describe("Test vendor mappers functions", () => {
  describe("mapReviewStatus", () => {
    it("should map string to ReviewStatus enum", () => {
      let result = mapReviewStatus("not started");
      expect(result).toBe(ReviewStatus.NotStarted);

      result = mapReviewStatus("in review");
      expect(result).toBe(ReviewStatus.InReview);

      result = mapReviewStatus("reviewed");
      expect(result).toBe(ReviewStatus.Reviewed);

      result = mapReviewStatus("requires follow-up");
      expect(result).toBe(ReviewStatus.RequiresFollowUp);
    });
    it("should return ReviewStatus.NotStarted for unknown strings", () => {
      const result = mapReviewStatus("unknown status");
      expect(result).toBe(ReviewStatus.NotStarted);
    });
  });
  describe("mapDataSensitivity", () => {
    it("should map string to DataSensitivity enum", () => {
      let result = mapDataSensitivity("none");
      expect(result).toBe(DataSensitivity.None);

      result = mapDataSensitivity("internal only");
      expect(result).toBe(DataSensitivity.InternalOnly);

      result = mapDataSensitivity("personally identifiable information (pii)");
      expect(result).toBe(DataSensitivity.PII);

      result = mapDataSensitivity("financial data");
      expect(result).toBe(DataSensitivity.FinancialData);

      result = mapDataSensitivity("health data (e.g. hipaa)");
      expect(result).toBe(DataSensitivity.HealthData);

      result = mapDataSensitivity("model weights or ai assets");
      expect(result).toBe(DataSensitivity.ModelWeights);

      result = mapDataSensitivity("other sensitive data");
      expect(result).toBe(DataSensitivity.OtherSensitive);
    });
    it("should return undefined for undefined input", () => {
      const result = mapDataSensitivity();
      expect(result).toBeUndefined();
    });
    it("should return default value for unknown strings", () => {
      const result = mapDataSensitivity("unknown sensitivity");
      expect(result).toBe(DataSensitivity.None);
    });
  });
  describe("mapBusinessCriticality", () => {
    it("should map string to BusinessCriticality enum", () => {
      let result = mapBusinessCriticality("low (vendor supports non-core functions)");
      expect(result).toBe(BusinessCriticality.Low);

      result = mapBusinessCriticality("medium (affects operations but is replaceable)");
      expect(result).toBe(BusinessCriticality.Medium);

      result = mapBusinessCriticality("high (critical to core services or products)");
      expect(result).toBe(BusinessCriticality.High);
    });
    it("should return undefined for undefined input", () => {
      const result = mapBusinessCriticality();
      expect(result).toBeUndefined();
    });
    it("should return default value for unknown strings", () => {
      const result = mapBusinessCriticality("unknown criticality");
      expect(result).toBe(BusinessCriticality.Low);
    });
  });
  describe("mapPastIssues", () => {
    it("should map string to PastIssues enum", () => {
      let result = mapPastIssues("none");
      expect(result).toBe(PastIssues.None);

      result = mapPastIssues("minor incident (e.g. small delay, minor bug)");
      expect(result).toBe(PastIssues.MinorIncident);

      result = mapPastIssues("major incident (e.g. data breach, legal issue)");
      expect(result).toBe(PastIssues.MajorIncident);
    });
    it("should return undefined for undefined input", () => {
      const result = mapPastIssues();
      expect(result).toBeUndefined();
    });
    it("should return default value for unknown strings", () => {
      const result = mapPastIssues("unknown issues");
      expect(result).toBe(PastIssues.None);
    });
  });
  describe("mapRegulatoryExposure", () => {
    it("should map string to RegulatoryExposure enum", () => {
      let result = mapRegulatoryExposure("none");
      expect(result).toBe(RegulatoryExposure.None);

      result = mapRegulatoryExposure("gdpr (eu)");
      expect(result).toBe(RegulatoryExposure.GDPR);

      result = mapRegulatoryExposure("hipaa (us)");
      expect(result).toBe(RegulatoryExposure.HIPAA);

      result = mapRegulatoryExposure("soc 2");
      expect(result).toBe(RegulatoryExposure.SOC2);

      result = mapRegulatoryExposure("iso 27001");
      expect(result).toBe(RegulatoryExposure.ISO27001);

      result = mapRegulatoryExposure("eu ai act");
      expect(result).toBe(RegulatoryExposure.EUAIAct);

      result = mapRegulatoryExposure("ccpa (california)");
      expect(result).toBe(RegulatoryExposure.CCPA);

      result = mapRegulatoryExposure("other");
      expect(result).toBe(RegulatoryExposure.Other);
    });
    it("should return undefined for undefined input", () => {
      const result = mapRegulatoryExposure();
      expect(result).toBeUndefined();
    });
    it("should return default value for unknown strings", () => {
      const result = mapRegulatoryExposure("unknown exposure");
      expect(result).toBe(RegulatoryExposure.None);
    });
  });
  describe("mapVendorResponseDTOToModel", () => {
    it("should map VendorResponseDTO to Vendor model correctly", () => {
      const dto = new VendorDTOBuilder().build();
      const model = mapVendorResponseDTOToModel(dto);
      expect(model).toBeInstanceOf(VendorModel);
      Object.entries(model).forEach(([key, value]) => {
        const exclude = [
          "review_status",
          "data_sensitivity",
          "business_criticality",
          "past_issues",
          "regulatory_exposure",
          "review_date",
          "created_at",
        ];
        if (exclude.includes(key)) return;
        expect(value).toBe((dto as never)[key]);
      });
      expect(model.review_status).toBe(ReviewStatus.Reviewed);
      expect(model.review_date).toBeInstanceOf(Date);
      expect(model.created_at).toBeInstanceOf(Date);
      expect(model.review_date).toEqual(new Date(dto.review_date));
      expect(model.created_at).toEqual(new Date(dto.created_at!));
      expect(model.data_sensitivity).toBe(DataSensitivity.None);
      expect(model.business_criticality).toBe(BusinessCriticality.Low);
      expect(model.past_issues).toBe(PastIssues.None);
      expect(model.regulatory_exposure).toBe(RegulatoryExposure.GDPR);
    });
    it("should return undefined for created_at if not provided", () => {
      const dto = new VendorDTOBuilder().withoutCreatedAt().build();
      const model = mapVendorResponseDTOToModel(dto);
      expect(model.created_at).toBeUndefined();
    });
  });
  describe("mapVendorResponseDTOsToModels", () => {
    it("should map array of VendorResponseDTOs to array of Vendor models", () => {
      const dto1 = new VendorDTOBuilder(1).build();
      const dto2 = new VendorDTOBuilder(2).build();
      const models = mapVendorResponseDTOsToModels([dto1, dto2]);
      expect(models.length).toBe(2);
      models.forEach((model) => {
        expect(model).toBeInstanceOf(VendorModel);
      });
      expect(models[0].id).toBe(dto1.id);
      expect(models[1].id).toBe(dto2.id);
    });
  });
  describe("mapVendorToCreateDTO", () => {
    it("should map Vendor model to CreateVendorDTO correctly", () => {
      const dto = new VendorModelBuilder().build();
      const createDTO = mapVendorToCreateDTO(dto);
      Object.entries(createDTO).forEach(([key, value]) => {
        if (key === "review_date") {
          expect(value).toBe(dto.review_date?.toISOString());
        } else {
          expect(value).toBe((dto as never)[key]);
        }
      });
    });
    it("should return empty string for vendor_name if not provided", () => {
      const dto = new VendorModelBuilder().withoutVendorName().build();
      const createDTO = mapVendorToCreateDTO(dto);
      expect(createDTO.vendor_name).toBe("");
    });
    it("should return empty string for vendor_provides if not provided", () => {
      const dto = new VendorModelBuilder().withoutProvider().build();
      const createDTO = mapVendorToCreateDTO(dto);
      expect(createDTO.vendor_provides).toBe("");
    });
    it("should return 0 for assignee if not provided", () => {
      const dto = new VendorModelBuilder().withoutAssignee().build();
      const createDTO = mapVendorToCreateDTO(dto);
      expect(createDTO.assignee).toBe(0);
    });
    it("should return empty string for website if not provided", () => {
      const dto = new VendorModelBuilder().withoutWebsite().build();
      const createDTO = mapVendorToCreateDTO(dto);
      expect(createDTO.website).toBe("");
    });
    it("should return empty string for vendor_contact_person if not provided", () => {
      const dto = new VendorModelBuilder().withoutContactPerson().build();
      const createDTO = mapVendorToCreateDTO(dto);
      expect(createDTO.vendor_contact_person).toBe("");
    });
    it("should return empty string for review_result if not provided", () => {
      const dto = new VendorModelBuilder().withoutReviewResult().build();
      const createDTO = mapVendorToCreateDTO(dto);
      expect(createDTO.review_result).toBe("");
    });
    it("should return default status for review_status if not provided", () => {
      const dto = new VendorModelBuilder().withoutReviewStatus().build();
      const createDTO = mapVendorToCreateDTO(dto);
      expect(createDTO.review_status).toBe(ReviewStatus.NotStarted);
    });
    it("should return 0 for reviewer if not provided", () => {
      const dto = new VendorModelBuilder().withoutReviewer().build();
      const createDTO = mapVendorToCreateDTO(dto);
      expect(createDTO.reviewer).toBe(0);
    });
    it("should return current date string for review_date if not provided", () => {
      const dto = new VendorModelBuilder().withoutReviewDate().build();
      const beforeMapping = new Date();
      const createDTO = mapVendorToCreateDTO(dto);
      const afterMapping = new Date();
      const mappedDate = new Date(createDTO.review_date);
      expect(mappedDate >= beforeMapping && mappedDate <= afterMapping).toBe(true);
    });
  });
  describe("mapVendorToUpdateDTO", () => {
    it("should map Vendor model to UpdateVendorDTO correctly", () => {
      const dto = new VendorModelBuilder().build();
      const updateDTO = mapVendorToUpdateDTO(dto);
      Object.entries(updateDTO).forEach(([key, value]) => {
        if (key === "review_date") {
          expect(value).toBe(dto.review_date?.toISOString());
        } else {
          expect(value).toBe((dto as never)[key]);
        }
      });
    });
  });
});
