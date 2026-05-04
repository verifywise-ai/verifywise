import { describe, it, expect } from "vitest";
import { FrameworkModel } from "../framework/framework.model";
import { RoleModel } from "../role/role.model";
import { OrganizationModel } from "../organization/organization.model";
import { ProjectModel } from "../project/project.model";
import { ProjectFrameworksModel } from "../projectFramework/projectFrameworks.model";
import { ProjectsMembersModel } from "../projectsMembers/projectsMembers.model";
import { VendorModel } from "../vendor/vendor.model";
import { VendorRiskModel } from "../vendorRisk/vendorRisk.model";
import { VendorsProjectsModel } from "../vendorsProjects/vendorsProjects.model";
import { SubscriptionModel } from "../subscription/subscription.model";
import { TierModel } from "../tier/tier.model";
import { TierFeatureModel } from "../tierFeature/tierFeature.model";
import { UserModel } from "../user/user.model";
import { UserPreferencesModel } from "../userPreferences/userPreferences.model";
import { EventModel } from "../evenTracker/eventTracker.model";

describe("FrameworkModel", () => {
  const data = {
    id: 1,
    name: "EU AI Act",
    description: "European AI regulation",
    created_at: new Date(),
    is_organizational: false,
  } as FrameworkModel;

  it("constructor copies fields", () => {
    const model = new FrameworkModel(data);
    expect(model.name).toBe("EU AI Act");
    expect(model.is_organizational).toBe(false);
  });

  it("static factory returns instance", () => {
    expect(FrameworkModel.createNewFramework(data)).toBeInstanceOf(FrameworkModel);
  });
});

describe("RoleModel", () => {
  const data = { id: 1, name: "Admin", description: "Full access" } as RoleModel;

  it("constructor copies fields", () => {
    const model = new RoleModel(data);
    expect(model.name).toBe("Admin");
  });

  it("static factory returns instance", () => {
    expect(RoleModel.createRole(data)).toBeInstanceOf(RoleModel);
  });
});

describe("OrganizationModel", () => {
  const data = {
    id: 1,
    name: "Acme Corp",
    logo: "logo.png",
    created_at: new Date(),
  } as OrganizationModel;

  it("constructor copies fields", () => {
    const model = new OrganizationModel(data);
    expect(model.name).toBe("Acme Corp");
  });

  it("static factory returns instance", () => {
    expect(OrganizationModel.createNewOrganization(data)).toBeInstanceOf(OrganizationModel);
  });

  it("fromApiData converts string date", () => {
    const model = OrganizationModel.fromApiData({
      id: 1,
      name: "X",
      logo: "l.png",
      created_at: "2024-01-01",
    });
    expect(model.created_at).toBeInstanceOf(Date);
  });

  describe("validateName", () => {
    it("rejects empty name", () => {
      const model = new OrganizationModel({ ...data, name: "" } as OrganizationModel);
      expect(model.validateName().accepted).toBe(false);
    });

    it("rejects name shorter than 2 chars", () => {
      const model = new OrganizationModel({ ...data, name: "A" } as OrganizationModel);
      expect(model.validateName().accepted).toBe(false);
    });

    it("rejects name longer than 50 chars", () => {
      const model = new OrganizationModel({ ...data, name: "A".repeat(51) } as OrganizationModel);
      expect(model.validateName().accepted).toBe(false);
    });

    it("accepts valid name", () => {
      expect(new OrganizationModel(data).validateName().accepted).toBe(true);
    });
  });

  describe("validateLogoFile", () => {
    it("rejects non-image files", () => {
      const file = new File([""], "doc.txt", { type: "text/plain" });
      expect(OrganizationModel.validateLogoFile(file).isValid).toBe(false);
    });

    it("rejects files > 5MB", () => {
      const file = new File([new ArrayBuffer(6 * 1024 * 1024)], "big.png", { type: "image/png" });
      expect(OrganizationModel.validateLogoFile(file).isValid).toBe(false);
    });

    it("accepts valid image file", () => {
      const file = new File(["img"], "logo.png", { type: "image/png" });
      expect(OrganizationModel.validateLogoFile(file).isValid).toBe(true);
    });
  });
});

describe("ProjectModel", () => {
  const data = {
    id: 1,
    project_title: "AI Compliance",
    owner: 1,
    start_date: new Date(),
    ai_risk_classification: "high_risk",
    type_of_high_risk_role: "provider",
    goal: "Ensure compliance",
    last_updated: new Date(),
    last_updated_by: 1,
    is_organizational: false,
  } as unknown as ProjectModel;

  it("constructor copies fields", () => {
    const model = new ProjectModel(data);
    expect(model.project_title).toBe("AI Compliance");
  });

  it("static factory returns instance", () => {
    expect(ProjectModel.createNewProject(data)).toBeInstanceOf(ProjectModel);
  });
});

describe("ProjectFrameworksModel", () => {
  const data = { framework_id: 1, project_id: 2 } as ProjectFrameworksModel;

  it("constructor copies fields", () => {
    const model = new ProjectFrameworksModel(data);
    expect(model.framework_id).toBe(1);
    expect(model.project_id).toBe(2);
  });

  it("static factory returns instance", () => {
    expect(ProjectFrameworksModel.createNewProjectFrameworks(data)).toBeInstanceOf(
      ProjectFrameworksModel,
    );
  });
});

describe("ProjectsMembersModel", () => {
  const data = { user_id: 1, project_id: 2 } as ProjectsMembersModel;

  it("constructor copies fields", () => {
    const model = new ProjectsMembersModel(data);
    expect(model.user_id).toBe(1);
  });

  it("static factory returns instance", () => {
    expect(ProjectsMembersModel.createNewProjectsMembers(data)).toBeInstanceOf(
      ProjectsMembersModel,
    );
  });
});

describe("VendorModel", () => {
  const data = {
    id: 1,
    vendor_name: "AWS",
    vendor_provides: "Cloud",
    assignee: 1,
    website: "https://aws.amazon.com",
    vendor_contact_person: "John",
    review_result: "Approved",
    review_status: "reviewed",
    reviewer: 2,
    review_date: new Date(),
  } as unknown as VendorModel;

  it("constructor copies fields", () => {
    const model = new VendorModel(data);
    expect(model.vendor_name).toBe("AWS");
  });

  it("static factory returns instance", () => {
    expect(VendorModel.createNewVendor(data)).toBeInstanceOf(VendorModel);
  });
});

describe("VendorRiskModel", () => {
  const data = {
    id: 1,
    vendor_id: 10,
    risk_description: "Data breach",
    impact_description: "High impact",
    impact: "High",
    likelihood: "Likely",
    risk_severity: "Critical",
    action_plan: "Mitigate",
    action_owner: 1,
    risk_level: "High",
  } as unknown as VendorRiskModel;

  it("constructor copies fields", () => {
    const model = new VendorRiskModel(data);
    expect(model.risk_description).toBe("Data breach");
  });

  it("static factory returns instance", () => {
    expect(VendorRiskModel.createNewVendorRisk(data)).toBeInstanceOf(VendorRiskModel);
  });
});

describe("VendorsProjectsModel", () => {
  const data = { vendor_id: 1, project_id: 2 } as VendorsProjectsModel;

  it("constructor copies fields", () => {
    const model = new VendorsProjectsModel(data);
    expect(model.vendor_id).toBe(1);
  });

  it("static factory returns instance", () => {
    expect(VendorsProjectsModel.createNewVendorProject(data)).toBeInstanceOf(VendorsProjectsModel);
  });
});

describe("SubscriptionModel", () => {
  const data = {
    id: 1,
    organization_id: 1,
    tier_id: 2,
    stripe_sub_id: "sub_123",
    status: "active",
    start_date: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  } as unknown as SubscriptionModel;

  it("constructor copies fields", () => {
    const model = new SubscriptionModel(data);
    expect(model.stripe_sub_id).toBe("sub_123");
  });

  it("static factory returns instance", () => {
    expect(SubscriptionModel.createSubscription(data)).toBeInstanceOf(SubscriptionModel);
  });
});

describe("TierModel", () => {
  const features = { seats: 5, projects: 10, frameworks: 3 } as TierFeatureModel;
  const data = {
    id: 1,
    name: "Pro",
    price: 99,
    features,
    created_at: new Date(),
    updated_at: new Date(),
  } as TierModel;

  it("constructor copies fields", () => {
    const model = new TierModel(data);
    expect(model.name).toBe("Pro");
    expect(model.price).toBe(99);
  });

  it("static factory returns instance", () => {
    expect(TierModel.createTier(data)).toBeInstanceOf(TierModel);
  });
});

describe("TierFeatureModel", () => {
  const data = { seats: 5, projects: 10, frameworks: 3 } as TierFeatureModel;

  it("constructor copies fields", () => {
    const model = new TierFeatureModel(data);
    expect(model.seats).toBe(5);
    expect(model.projects).toBe(10);
  });

  it("static factory returns instance", () => {
    expect(TierFeatureModel.createTierFeature(data)).toBeInstanceOf(TierFeatureModel);
  });
});

describe("UserModel", () => {
  const data = {
    id: 1,
    name: "Alice",
    surname: "Smith",
    email: "alice@example.com",
  } as UserModel;

  it("constructor copies fields", () => {
    const model = new UserModel(data);
    expect(model.name).toBe("Alice");
    expect(model.email).toBe("alice@example.com");
  });

  it("static factory returns instance", () => {
    expect(UserModel.createNewUser(data)).toBeInstanceOf(UserModel);
  });
});

describe("UserPreferencesModel", () => {
  const data = { id: 1, user_id: 1, date_format: "DD-MM-YYYY" } as unknown as UserPreferencesModel;

  it("constructor copies fields", () => {
    const model = new UserPreferencesModel(data);
    expect(model.user_id).toBe(1);
  });

  it("static factory returns instance", () => {
    expect(UserPreferencesModel.createNewUserPreferences(data)).toBeInstanceOf(
      UserPreferencesModel,
    );
  });
});

describe("EventModel", () => {
  const data = {
    id: 1,
    event_type: "Create" as const,
    description: "Created project",
    user_id: 1,
    timestamp: "2024-01-01T00:00:00Z",
  } as EventModel;

  it("constructor copies fields", () => {
    const model = new EventModel(data);
    expect(model.event_type).toBe("Create");
    expect(model.description).toBe("Created project");
  });

  it("static factory returns instance", () => {
    expect(EventModel.createNewEvent(data)).toBeInstanceOf(EventModel);
  });
});
