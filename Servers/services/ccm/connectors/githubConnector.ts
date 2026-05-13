import { BaseConnector, TestExecutionResult } from "./baseConnector";

/**
 * GitHub Connector for CCM
 *
 * Reuses existing GitHub token infrastructure.
 * Supports: branch protection, required reviews, secret scanning.
 */

export class GithubConnector extends BaseConnector {
  readonly type = "github";
  readonly displayName = "GitHub";
  readonly supportedTestTypes = [
    "branch_protection",
    "required_reviews",
    "secret_scanning",
  ];

  private get headers(): Record<string, string> {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  private get baseUrl(): string {
    return (this.config.baseUrl as string) || "https://api.github.com";
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/user`, { headers: this.headers });
      if (!response.ok) {
        const error = await response.text();
        return { success: false, message: `GitHub API error ${response.status}: ${error}` };
      }
      const data = await response.json();
      return { success: true, message: `Connected as ${data.login}` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "GitHub connection error",
      };
    }
  }

  async executeTest(testConfig: Record<string, unknown>): Promise<TestExecutionResult> {
    const testType = testConfig.testType as string;
    const owner = testConfig.owner as string;
    const repo = testConfig.repo as string;

    if (!owner || !repo) {
      return { status: "error", message: "Missing 'owner' or 'repo' in test config" };
    }

    switch (testType) {
      case "branch_protection":
        return this.checkBranchProtection(owner, repo, (testConfig.branch as string) || "main");
      case "required_reviews":
        return this.checkRequiredReviews(owner, repo, (testConfig.branch as string) || "main");
      case "secret_scanning":
        return this.checkSecretScanning(owner, repo);
      default:
        return { status: "error", message: `Unsupported test type: ${testType}` };
    }
  }

  private async checkBranchProtection(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<TestExecutionResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${owner}/${repo}/branches/${branch}/protection`,
        { headers: this.headers },
      );

      if (response.status === 404) {
        return {
          status: "fail",
          message: `Branch protection not enabled for ${branch} in ${owner}/${repo}.`,
        };
      }

      if (!response.ok) {
        return {
          status: "error",
          message: `GitHub API error ${response.status}`,
        };
      }

      const data = await response.json();
      const hasProtection = data.enabled;

      return {
        status: hasProtection ? "pass" : "fail",
        message: hasProtection
          ? `Branch protection enabled for ${branch} in ${owner}/${repo}.`
          : `Branch protection disabled for ${branch} in ${owner}/${repo}.`,
        details: { branch, rules: data },
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Branch protection check failed",
      };
    }
  }

  private async checkRequiredReviews(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<TestExecutionResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${owner}/${repo}/branches/${branch}/protection`,
        { headers: this.headers },
      );

      if (response.status === 404) {
        return {
          status: "fail",
          message: `No branch protection (and therefore no required reviews) for ${branch}.`,
        };
      }

      if (!response.ok) {
        return { status: "error", message: `GitHub API error ${response.status}` };
      }

      const data = await response.json();
      const requiredReviews = data.required_pull_request_reviews;
      const minReviews = requiredReviews?.required_approving_review_count || 0;
      const requiredMin = (this.config.minRequiredReviews as number) || 1;

      if (minReviews >= requiredMin) {
        return {
          status: "pass",
          message: `${branch} requires ${minReviews} approving review(s).`,
          details: { requiredReviews },
        };
      }

      return {
        status: "fail",
        message: `${branch} requires only ${minReviews} review(s), minimum expected is ${requiredMin}.`,
        details: { requiredReviews, expectedMin: requiredMin },
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Required reviews check failed",
      };
    }
  }

  private async checkSecretScanning(owner: string, repo: string): Promise<TestExecutionResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${owner}/${repo}`,
        { headers: this.headers },
      );

      if (!response.ok) {
        return { status: "error", message: `GitHub API error ${response.status}` };
      }

      const data = await response.json();
      const securityFeatures = data.security_and_analysis || {};
      const secretScanning = securityFeatures.secret_scanning?.status === "enabled";

      return {
        status: secretScanning ? "pass" : "fail",
        message: secretScanning
          ? `Secret scanning is enabled for ${owner}/${repo}.`
          : `Secret scanning is disabled for ${owner}/${repo}.`,
        details: { securityFeatures },
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Secret scanning check failed",
      };
    }
  }
}
