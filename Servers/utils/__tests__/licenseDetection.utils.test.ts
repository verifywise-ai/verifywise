import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import {
  extractLicenseFromPackageJson,
  extractLicenseFromPyproject,
  extractLicenseFromSetupPy,
  inferHuggingFaceLicense,
  extractLicenseFromCode,
  detectLicenseFromFile,
} from "../licenseDetection.utils";

jest.mock("../../config/licenseRiskMatrix", () => ({
  getLicenseInfo: jest.fn((id: string) => ({
    spdxId: id.toLowerCase().replace(/\s/g, "-"),
    name: id,
    risk: "low",
  })),
  LicenseRisk: { LOW: "low", MEDIUM: "medium", HIGH: "high" },
}));

describe("licenseDetection.utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("extractLicenseFromPackageJson", () => {
    it("should extract string license from package.json", () => {
      const content = JSON.stringify({ name: "my-package", license: "MIT" });
      const result = extractLicenseFromPackageJson(content);
      expect(result.size).toBe(1);
      expect(result.get("my-package")).toEqual({
        licenseId: "mit",
        licenseName: "MIT",
        licenseRisk: "low",
        licenseSource: "npm",
      });
    });

    it("should extract object license with type from package.json", () => {
      const content = JSON.stringify({
        name: "my-package",
        license: { type: "Apache-2.0", url: "https://example.com" },
      });
      const result = extractLicenseFromPackageJson(content);
      expect(result.size).toBe(1);
      expect(result.get("my-package")).toEqual({
        licenseId: "apache-2.0",
        licenseName: "Apache-2.0",
        licenseRisk: "low",
        licenseSource: "npm",
      });
    });

    it("should extract license from licenses array", () => {
      const content = JSON.stringify({
        name: "my-package",
        licenses: [{ type: "BSD-3-Clause", url: "https://example.com" }],
      });
      const result = extractLicenseFromPackageJson(content);
      expect(result.size).toBe(1);
      expect(result.get("my-package")).toEqual({
        licenseId: "bsd-3-clause",
        licenseName: "BSD-3-Clause",
        licenseRisk: "low",
        licenseSource: "npm",
      });
    });

    it("should return empty Map when license is missing", () => {
      const content = JSON.stringify({ name: "my-package" });
      const result = extractLicenseFromPackageJson(content);
      expect(result.size).toBe(0);
    });

    it("should return empty Map when JSON is invalid", () => {
      const result = extractLicenseFromPackageJson("not valid json");
      expect(result.size).toBe(0);
    });
  });

  describe("extractLicenseFromPyproject", () => {
    it('should extract license from license = "MIT"', () => {
      const content = 'name = "my-package"\nlicense = "MIT"\nversion = "1.0.0"';
      const result = extractLicenseFromPyproject(content);
      expect(result.size).toBe(1);
      expect(result.get("my-package")).toEqual({
        licenseId: "mit",
        licenseName: "MIT",
        licenseRisk: "low",
        licenseSource: "pypi",
      });
    });

    it("should extract license from [project] section", () => {
      const content = '[project]\nname = "my-package"\nlicense = "Apache-2.0"';
      const result = extractLicenseFromPyproject(content);
      expect(result.size).toBe(1);
      expect(result.get("my-package")).toEqual({
        licenseId: "apache-2.0",
        licenseName: "Apache-2.0",
        licenseRisk: "low",
        licenseSource: "pypi",
      });
    });

    it("should return empty Map when required fields are missing", () => {
      const content = 'version = "1.0.0"';
      const result = extractLicenseFromPyproject(content);
      expect(result.size).toBe(0);
    });
  });

  describe("extractLicenseFromSetupPy", () => {
    it("should extract license and name from setup.py", () => {
      const content = 'setup(\n    name="my-package",\n    license="MIT",\n    version="1.0.0"\n)';
      const result = extractLicenseFromSetupPy(content);
      expect(result.size).toBe(1);
      expect(result.get("my-package")).toEqual({
        licenseId: "mit",
        licenseName: "MIT",
        licenseRisk: "low",
        licenseSource: "pypi",
      });
    });

    it("should return empty Map when required fields are missing", () => {
      const content = 'setup(\n    license="MIT"\n)';
      const result = extractLicenseFromSetupPy(content);
      expect(result.size).toBe(0);
    });
  });

  describe("inferHuggingFaceLicense", () => {
    it("should return correct license for meta-llama model ID", () => {
      const result = inferHuggingFaceLicense("meta-llama/Llama-2-7b");
      expect(result).toEqual({
        licenseId: "llama2",
        licenseName: "Llama2",
        licenseRisk: "low",
        licenseSource: "huggingface",
      });
    });

    it("should return correct license for mistralai model ID", () => {
      const result = inferHuggingFaceLicense("mistralai/Mistral-7B");
      expect(result).toEqual({
        licenseId: "apache-2.0",
        licenseName: "Apache-2.0",
        licenseRisk: "low",
        licenseSource: "huggingface",
      });
    });

    it("should return correct license for google/gemma model ID", () => {
      const result = inferHuggingFaceLicense("google/gemma-2b");
      expect(result).toEqual({
        licenseId: "gemma",
        licenseName: "Gemma",
        licenseRisk: "low",
        licenseSource: "huggingface",
      });
    });

    it("should return correct license for EleutherAI model ID", () => {
      const result = inferHuggingFaceLicense("EleutherAI/gpt-j-6b");
      expect(result).toEqual({
        licenseId: "apache-2.0",
        licenseName: "Apache-2.0",
        licenseRisk: "low",
        licenseSource: "huggingface",
      });
    });

    it("should return correct license for microsoft model ID", () => {
      const result = inferHuggingFaceLicense("microsoft/DialoGPT");
      expect(result).toEqual({
        licenseId: "mit",
        licenseName: "MIT",
        licenseRisk: "low",
        licenseSource: "huggingface",
      });
    });

    it("should return correct license for facebook model ID", () => {
      const result = inferHuggingFaceLicense("facebook/bart-large");
      expect(result).toEqual({
        licenseId: "mit",
        licenseName: "MIT",
        licenseRisk: "low",
        licenseSource: "huggingface",
      });
    });

    it("should return null for unknown model IDs", () => {
      const result = inferHuggingFaceLicense("unknown-org/model");
      expect(result).toBeNull();
    });
  });

  describe("extractLicenseFromCode", () => {
    it('should extract license from from_pretrained("org/model") patterns', () => {
      const content = 'const model = AutoModel.from_pretrained("meta-llama/Llama-2-7b");';
      const result = extractLicenseFromCode(content, "Hugging Face");
      expect(result).toEqual({
        licenseId: "llama2",
        licenseName: "Llama2",
        licenseRisk: "low",
        licenseSource: "huggingface",
      });
    });

    it("should return provider default for known providers", () => {
      const result = extractLicenseFromCode("// some code", "OpenAI");
      expect(result).toEqual({
        licenseId: "mit",
        licenseName: "MIT",
        licenseRisk: "low",
        licenseSource: "package",
      });
    });

    it("should return null for unknown provider", () => {
      const result = extractLicenseFromCode("// some code", "UnknownProvider");
      expect(result).toBeNull();
    });
  });

  describe("detectLicenseFromFile", () => {
    it("should dispatch to package.json extractor", () => {
      const content = JSON.stringify({ name: "my-package", license: "MIT" });
      const result = detectLicenseFromFile("path/to/package.json", content);
      expect(result.size).toBe(1);
      expect(result.get("my-package")).toEqual({
        licenseId: "mit",
        licenseName: "MIT",
        licenseRisk: "low",
        licenseSource: "npm",
      });
    });

    it("should dispatch to pyproject.toml extractor", () => {
      const content = '[project]\nname = "my-package"\nlicense = "MIT"';
      const result = detectLicenseFromFile("path/to/pyproject.toml", content);
      expect(result.size).toBe(1);
      expect(result.get("my-package")).toEqual({
        licenseId: "mit",
        licenseName: "MIT",
        licenseRisk: "low",
        licenseSource: "pypi",
      });
    });

    it("should dispatch to setup.py extractor", () => {
      const content = 'setup(name="my-package", license="MIT")';
      const result = detectLicenseFromFile("path/to/setup.py", content);
      expect(result.size).toBe(1);
      expect(result.get("my-package")).toEqual({
        licenseId: "mit",
        licenseName: "MIT",
        licenseRisk: "low",
        licenseSource: "pypi",
      });
    });

    it("should return empty Map for unknown filenames", () => {
      const result = detectLicenseFromFile("path/to/README.md", "# Hello");
      expect(result.size).toBe(0);
    });
  });
});
