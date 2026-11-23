import { VendorResponseDTO } from "../../../../application/dtos";
import {
  BusinessCriticality,
  DataSensitivity,
  PastIssues,
  RegulatoryExposure,
  ReviewStatus,
} from "../../../../domain/enums/status.enum";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";

const vendorDto: VendorResponseDTO = {
  id: 1,
  order_no: 1001,
  vendor_name: "Test Vendor",
  vendor_provides: "Cloud Services",
  assignee: 2,
  website: "https://testvendor.com",
  vendor_contact_person: "Jane Doe",
  review_result: "Approved",
  review_status: "reviewed",
  reviewer: 3,
  review_date: "2024-01-15T10:00:00Z",
  is_demo: false,
  created_at: "2023-12-01T09:30:00Z",
  projects: [101, 102],
  data_sensitivity: "high",
  business_criticality: "critical",
  past_issues: "minor issues",
  regulatory_exposure: "gdpr (eu)",
  risk_score: 85,
  other_names: "Facebook, Instagram",
  country: "DE",
  registration_number: "HRB 86891",
  lei: "TEST00ACMEANALYT0154",
  sec_cik: "0000098765",
};

/** The identifiers of a vendor (spec Q1), each as the server stores it, or none. */
type Identifiers = Pick<VendorResponseDTO, "country" | "registration_number" | "lei" | "sec_cik">;

export class VendorDTOBuilder {
  private readonly dto: VendorResponseDTO;

  constructor(id: number = 1) {
    this.dto = { ...vendorDto };
    this.dto.id = id;
  }

  withoutCreatedAt(): this {
    this.dto.created_at = undefined;
    return this;
  }

  withOtherNames(otherNames: string | null | undefined): this {
    this.dto.other_names = otherNames;
    return this;
  }

  withIdentifiers(identifiers: Identifiers): this {
    Object.assign(this.dto, identifiers);
    return this;
  }

  build(): VendorResponseDTO {
    return this.dto;
  }
}

const vendorModel: VendorModel = {
  id: 1,
  order_no: 1001,
  vendor_name: "Test Vendor",
  vendor_provides: "Cloud Services",
  assignee: 2,
  website: "https://testvendor.com",
  vendor_contact_person: "Jane Doe",
  review_result: "Approved",
  review_status: ReviewStatus.InReview,
  reviewer: 3,
  review_date: new Date("2024-01-15T10:00:00Z"),
  is_demo: false,
  created_at: new Date("2023-12-01T09:30:00Z"),
  projects: [101, 102],
  data_sensitivity: DataSensitivity.FinancialData,
  business_criticality: BusinessCriticality.High,
  past_issues: PastIssues.MajorIncident,
  regulatory_exposure: RegulatoryExposure.GDPR,
  risk_score: 85,
  other_names: "Facebook, Instagram",
  country: "DE",
  registration_number: "HRB 86891",
  lei: "TEST00ACMEANALYT0154",
  sec_cik: "0000098765",
};

export class VendorModelBuilder {
  private readonly model: Partial<VendorModel>;

  constructor(id: number = 1) {
    this.model = { ...vendorModel };
    this.model.id = id;
  }

  withoutVendorName(): this {
    this.model.vendor_name = undefined;
    return this;
  }

  withOtherNames(otherNames: string | null | undefined): this {
    this.model.other_names = otherNames;
    return this;
  }

  withIdentifiers(identifiers: Identifiers): this {
    Object.assign(this.model, identifiers);
    return this;
  }

  withoutProvider(): this {
    this.model.vendor_provides = undefined;
    return this;
  }

  withoutAssignee(): this {
    this.model.assignee = undefined;
    return this;
  }

  withoutWebsite(): this {
    this.model.website = undefined;
    return this;
  }

  withoutContactPerson(): this {
    this.model.vendor_contact_person = undefined;
    return this;
  }

  withoutReviewResult(): this {
    this.model.review_result = undefined;
    return this;
  }

  withoutReviewStatus(): this {
    this.model.review_status = undefined;
    return this;
  }

  withoutReviewer(): this {
    this.model.reviewer = undefined;
    return this;
  }

  withoutReviewDate(): this {
    this.model.review_date = undefined;
    return this;
  }

  build(): Partial<VendorModel> {
    return this.model;
  }
}
