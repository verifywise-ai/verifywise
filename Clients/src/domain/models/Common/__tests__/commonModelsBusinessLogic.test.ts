import { describe, it, expect } from "vitest";
import { FileModel } from "../file/file.model";
import { ApiTokenModel } from "../apiToken/apiToken.model";
import { LLMKeysModel } from "../llmKeys/llmKeys.model";
import { PolicyManagerModel } from "../policy/policyManager.model";
import { TrainingRegistarModel } from "../trainingRegistar/trainingRegistar.model";
import { TaskModel } from "../task/task.model";
import { AITrustCenterInfoModel } from "../aiTrustCenter/AITrustCenterInfoModel.model";
import { AITrustCenterComplianceBadgesModel } from "../aiTrustCenter/AITrustCenterComplianceBadges.model";
import { AITrustCenterCompanyDescriptionModel } from "../aiTrustCenter/AITrustCenterCompanyDescription.model";
import { AITrustCenterIntroModel } from "../aiTrustCenter/AITrustCenterIntro.model";
import { AITrustCenterResourcesModel } from "../aiTrustCenter/AITrustCenterResources.model";
import { AITrustCenterSubprocessorsModel } from "../aiTrustCenter/AITrustCenterSubprocessors.model";
import { AITrustCenterTermsAndContactModel } from "../aiTrustCenter/AITrustCenterTermsAndContact.model";
import { EvidenceHubModel } from "../evidenceHub/evidenceHub.model";

// --- FileModel ---
describe("FileModel", () => {
  const baseFile = {
    id: "f1",
    fileName: "report.pdf",
    type: "application/pdf",
    uploadDate: new Date("2024-01-15"),
    uploader: "user1",
    size: 2048576, // ~2MB
  } as FileModel;

  it("fromApiData converts string uploadDate to Date", () => {
    const model = FileModel.fromApiData({ ...baseFile, uploadDate: "2024-01-15" });
    expect(model.uploadDate).toBeInstanceOf(Date);
  });

  it("createNewFile provides defaults for missing fields", () => {
    const model = FileModel.createNewFile({ fileName: "test.txt" });
    expect(model.id).toBe("");
    expect(model.uploader).toBe("");
  });

  describe("getFormattedSize", () => {
    it("formats bytes to KB", () => {
      const model = new FileModel({ ...baseFile, size: 1536 } as FileModel);
      expect(model.getFormattedSize()).toBe("1.5 KB");
    });

    it("formats bytes to MB", () => {
      const model = new FileModel({ ...baseFile, size: 2097152 } as FileModel);
      expect(model.getFormattedSize()).toBe("2.0 MB");
    });

    it("returns 'Unknown' when size is undefined", () => {
      const model = new FileModel({ ...baseFile, size: undefined } as FileModel);
      expect(model.getFormattedSize()).toBe("Unknown");
    });
  });

  describe("getFileExtension", () => {
    it("returns extension for normal file", () => {
      expect(new FileModel(baseFile).getFileExtension()).toBe("pdf");
    });

    it("returns empty string for file without extension", () => {
      const model = new FileModel({ ...baseFile, fileName: "noext" } as FileModel);
      expect(model.getFileExtension()).toBe("");
    });
  });

  describe("file type detection", () => {
    it("isImageFile returns true for .png", () => {
      const model = new FileModel({ ...baseFile, fileName: "photo.png" } as FileModel);
      expect(model.isImageFile()).toBe(true);
    });

    it("isDocumentFile returns true for .pdf", () => {
      expect(new FileModel(baseFile).isDocumentFile()).toBe(true);
    });

    it("isSpreadsheetFile returns true for .xlsx", () => {
      const model = new FileModel({ ...baseFile, fileName: "data.xlsx" } as FileModel);
      expect(model.isSpreadsheetFile()).toBe(true);
    });

    it("isPresentationFile returns true for .pptx", () => {
      const model = new FileModel({ ...baseFile, fileName: "slides.pptx" } as FileModel);
      expect(model.isPresentationFile()).toBe(true);
    });
  });

  it("belongsToProject checks projectId", () => {
    const model = new FileModel({ ...baseFile, projectId: "p1" } as FileModel);
    expect(model.belongsToProject("p1")).toBe(true);
    expect(model.belongsToProject("p2")).toBe(false);
  });

  it("markAsEvidence returns new FileModel with isEvidence=true", () => {
    const model = new FileModel(baseFile);
    const marked = model.markAsEvidence();
    expect(marked.isEvidence).toBe(true);
    expect(marked).not.toBe(model); // immutable
  });

  it("unmarkAsEvidence returns new FileModel with isEvidence=false", () => {
    const model = new FileModel({ ...baseFile, isEvidence: true } as FileModel);
    const unmarked = model.unmarkAsEvidence();
    expect(unmarked.isEvidence).toBe(false);
  });

  describe("getFileCategory", () => {
    it("returns 'Image' for image files", () => {
      const model = new FileModel({ ...baseFile, fileName: "photo.jpg" } as FileModel);
      expect(model.getFileCategory()).toBe("Image");
    });

    it("returns 'Document' for document files", () => {
      expect(new FileModel(baseFile).getFileCategory()).toBe("Document");
    });

    it("returns 'Other' for unknown types", () => {
      const model = new FileModel({ ...baseFile, fileName: "file.xyz" } as FileModel);
      expect(model.getFileCategory()).toBe("Other");
    });
  });

  it("isRecentlyUploaded returns true for recent uploads", () => {
    const recentFile = new FileModel({ ...baseFile, uploadDate: new Date() } as FileModel);
    expect(recentFile.isRecentlyUploaded()).toBe(true);
  });

  it("isRecentlyUploaded returns false for old uploads", () => {
    const oldFile = new FileModel({
      ...baseFile,
      uploadDate: new Date("2020-01-01"),
    } as FileModel);
    expect(oldFile.isRecentlyUploaded()).toBe(false);
  });
});

// --- ApiTokenModel ---
describe("ApiTokenModel", () => {
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const pastDate = new Date(Date.now() - 86400000).toISOString();

  const activeToken = {
    id: 1,
    name: "My Token",
    token: "tok_123",
    expires_at: futureDate,
    // Midday mid-year so toLocaleDateString (local TZ) always resolves to
    // 2024 regardless of the test runner's timezone (±14h offset range).
    created_at: "2024-06-15T12:00:00Z",
    created_by: 1,
  } as ApiTokenModel;

  const expiredToken = {
    ...activeToken,
    expires_at: pastDate,
  } as ApiTokenModel;

  it("isExpired returns false for future expiry", () => {
    expect(new ApiTokenModel(activeToken).isExpired()).toBe(false);
  });

  it("isExpired returns true for past expiry", () => {
    expect(new ApiTokenModel(expiredToken).isExpired()).toBe(true);
  });

  it("getStatus returns 'Active' for valid token", () => {
    expect(new ApiTokenModel(activeToken).getStatus()).toBe("Active");
  });

  it("getStatus returns 'Expired' for expired token", () => {
    expect(new ApiTokenModel(expiredToken).getStatus()).toBe("Expired");
  });

  it("getStatusColor differs between active and expired", () => {
    const active = new ApiTokenModel(activeToken).getStatusColor();
    const expired = new ApiTokenModel(expiredToken).getStatusColor();
    expect(active).not.toBe(expired);
  });

  it("getFormattedCreatedDate returns formatted string", () => {
    const result = new ApiTokenModel(activeToken).getFormattedCreatedDate();
    expect(result).toContain("2024");
  });

  it("getFormattedExpiryDate returns formatted string", () => {
    const result = new ApiTokenModel(activeToken).getFormattedExpiryDate();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("createApiTokenForCreation returns partial with name", () => {
    const partial = ApiTokenModel.createApiTokenForCreation("Test Token");
    expect(partial.name).toBe("Test Token");
    expect(partial.created_at).toBeDefined();
  });
});

// --- LLMKeysModel ---
describe("LLMKeysModel", () => {
  it("getAvailableProviders returns provider names", () => {
    const providers = LLMKeysModel.getAvailableProviders();
    expect(providers).toContain("Anthropic");
    expect(providers).toContain("OpenAI");
  });

  it("getProviderConfig returns config for known provider", () => {
    const config = LLMKeysModel.getProviderConfig("Anthropic");
    expect(config).toBeDefined();
    expect(config!.id).toBe("anthropic");
  });

  it("getProviderConfig returns undefined for unknown", () => {
    expect(LLMKeysModel.getProviderConfig("Unknown" as any)).toBeUndefined();
  });

  it("getProviderIdByName returns correct id", () => {
    expect(LLMKeysModel.getProviderIdByName("OpenAI")).toBe("openai");
  });

  it("getProviderIdByName returns undefined for unknown", () => {
    expect(LLMKeysModel.getProviderIdByName("Unknown" as any)).toBeUndefined();
  });
});

// --- PolicyManagerModel ---
describe("PolicyManagerModel", () => {
  const data = {
    id: 1,
    title: "AI Ethics Policy",
    content_html: "<p>Policy content</p>",
    status: "published",
    tags: ["AI ethics", "Fairness"],
    author_id: 1,
    last_updated_by: 1,
    last_updated_at: new Date(),
    created_at: new Date(),
  } as PolicyManagerModel;

  it("constructor copies fields including tags", () => {
    const model = new PolicyManagerModel(data);
    expect(model.title).toBe("AI Ethics Policy");
    expect(model.tags).toEqual(["AI ethics", "Fairness"]);
  });

  it("static factory returns instance", () => {
    expect(PolicyManagerModel.createNewPolicyManager(data)).toBeInstanceOf(PolicyManagerModel);
  });
});

// --- TrainingRegistarModel ---
describe("TrainingRegistarModel", () => {
  const data = {
    training_name: "AI Safety Training",
    duration: "2 hours",
    provider: "Internal",
    department: "Engineering",
    status: "planned",
    numberOfPeople: 50,
    description: "Training on AI safety",
  } as any;

  it("create factory returns instance", () => {
    const model = TrainingRegistarModel.create(data);
    expect(model).toBeInstanceOf(TrainingRegistarModel);
    expect(model.training_name).toBe("AI Safety Training");
  });
});

// --- TaskModel ---
describe("TaskModel", () => {
  it("constructor provides defaults", () => {
    const model = new TaskModel();
    expect(model.title).toBe("");
    expect(model.priority).toBeDefined();
    expect(model.status).toBeDefined();
  });

  it("constructor accepts partial data", () => {
    const model = new TaskModel({ title: "Review code" });
    expect(model.title).toBe("Review code");
  });
});

// --- AI Trust Center Models ---
describe("AITrustCenterInfoModel", () => {
  const data = {
    id: 1,
    title: "Trust Center",
    visible: true,
    header_color: "#000",
    intro_visible: true,
    compliance_badges_visible: true,
    company_description_visible: true,
    terms_and_contact_visible: true,
    resources_visible: true,
    subprocessor_visible: true,
  } as AITrustCenterInfoModel;

  it("constructor and factory work", () => {
    const model = AITrustCenterInfoModel.createNewAITrustCenterInfo(data);
    expect(model).toBeInstanceOf(AITrustCenterInfoModel);
    expect(model.title).toBe("Trust Center");
  });
});

describe("AITrustCenterComplianceBadgesModel", () => {
  const data = {
    id: 1,
    soc2_type_i: true,
    soc2_type_ii: false,
    iso_27001: true,
    iso_42001: true,
    ccpa: false,
    gdpr: true,
    hipaa: false,
    eu_ai_act: true,
  } as AITrustCenterComplianceBadgesModel;

  it("constructor and factory work", () => {
    const model = AITrustCenterComplianceBadgesModel.createNewAITrustCenterComplianceBadges(data);
    expect(model).toBeInstanceOf(AITrustCenterComplianceBadgesModel);
    expect(model.gdpr).toBe(true);
  });
});

describe("AITrustCenterCompanyDescriptionModel", () => {
  const data = {
    id: 1,
    background_visible: true,
    background_text: "About us",
    core_benefits_visible: true,
    core_benefits_text: "Benefits",
    compliance_doc_visible: false,
    compliance_doc_text: "",
  } as AITrustCenterCompanyDescriptionModel;

  it("constructor and factory work", () => {
    const model = AITrustCenterCompanyDescriptionModel.createNewAITrustCenterCompanyDescription(data);
    expect(model).toBeInstanceOf(AITrustCenterCompanyDescriptionModel);
  });
});

describe("AITrustCenterIntroModel", () => {
  const data = {
    id: 1,
    purpose_visible: true,
    purpose_text: "Our purpose",
    our_statement_visible: true,
    our_statement_text: "Statement",
    our_mission_visible: true,
    our_mission_text: "Mission",
  } as AITrustCenterIntroModel;

  it("constructor and factory work", () => {
    const model = AITrustCenterIntroModel.createNewAITrustCenterIntro(data);
    expect(model).toBeInstanceOf(AITrustCenterIntroModel);
  });
});

describe("AITrustCenterResourcesModel", () => {
  const data = { id: 1, name: "Whitepaper", description: "AI doc", file_id: 5, visible: true } as AITrustCenterResourcesModel;

  it("constructor and factory work", () => {
    const model = AITrustCenterResourcesModel.createNewAITrustCenterResources(data);
    expect(model).toBeInstanceOf(AITrustCenterResourcesModel);
  });
});

describe("AITrustCenterSubprocessorsModel", () => {
  const data = { id: 1, name: "AWS", purpose: "Hosting", location: "US", url: "https://aws.amazon.com" } as AITrustCenterSubprocessorsModel;

  it("constructor and factory work", () => {
    const model = AITrustCenterSubprocessorsModel.createNewAITrustCenterSubprocessors(data);
    expect(model).toBeInstanceOf(AITrustCenterSubprocessorsModel);
  });
});

describe("AITrustCenterTermsAndContactModel", () => {
  const data = {
    id: 1,
    terms_visible: true,
    terms_text: "Terms",
    privacy_visible: true,
    privacy_text: "Privacy",
    email_visible: true,
    email_text: "info@example.com",
  } as AITrustCenterTermsAndContactModel;

  it("constructor and factory work", () => {
    const model = AITrustCenterTermsAndContactModel.createNewAITrustCenterTermsAndContact(data);
    expect(model).toBeInstanceOf(AITrustCenterTermsAndContactModel);
  });
});

// --- EvidenceHubModel ---
describe("EvidenceHubModel", () => {
  const data = {
    id: 1,
    evidence_name: "Security Audit",
    evidence_type: "audit",
    description: "Annual audit",
    evidence_files: [],
  } as EvidenceHubModel;

  it("constructor and factory work", () => {
    const model = EvidenceHubModel.createNewEvidence(data);
    expect(model).toBeInstanceOf(EvidenceHubModel);
    expect(model.evidence_name).toBe("Security Audit");
  });
});
