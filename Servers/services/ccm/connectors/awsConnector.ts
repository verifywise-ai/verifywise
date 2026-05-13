import { BaseConnector, TestExecutionResult } from "./baseConnector";

/**
 * AWS Connector for CCM
 *
 * Uses AWS SDK v3 with credentials from connector config.
 * Supports: S3 encryption, IAM MFA, CloudTrail, VPC flow logs checks.
 */

export class AwsConnector extends BaseConnector {
  readonly type = "aws";
  readonly displayName = "Amazon Web Services";
  readonly supportedTestTypes = [
    "s3_bucket_encryption",
    "iam_mfa_enforcement",
    "cloudtrail_enabled",
    "vpc_flow_logs",
  ];

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
      const client = this.createClient(STSClient);
      const result = await client.send(new GetCallerIdentityCommand({}));
      return {
        success: true,
        message: `Connected as account ${result.Account} (${result.Arn})`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown AWS connection error",
      };
    }
  }

  async executeTest(testConfig: Record<string, unknown>): Promise<TestExecutionResult> {
    const testType = testConfig.testType as string;

    switch (testType) {
      case "s3_bucket_encryption":
        return this.checkS3Encryption(testConfig);
      case "iam_mfa_enforcement":
        return this.checkIamMfa(testConfig);
      case "cloudtrail_enabled":
        return this.checkCloudTrail(testConfig);
      case "vpc_flow_logs":
        return this.checkVpcFlowLogs(testConfig);
      default:
        return {
          status: "error",
          message: `Unsupported test type: ${testType}`,
        };
    }
  }

  private createClient(ClientClass: any, extraConfig?: Record<string, unknown>) {
    const region = (this.config.region as string) || "us-east-1";
    const credentials: any = {};

    if (this.config.accessKeyId && this.config.secretAccessKey) {
      credentials.accessKeyId = this.config.accessKeyId;
      credentials.secretAccessKey = this.config.secretAccessKey;
    }

    return new ClientClass({
      region,
      ...(Object.keys(credentials).length > 0 ? { credentials } : {}),
      ...extraConfig,
    });
  }

  private async checkS3Encryption(testConfig: Record<string, unknown>): Promise<TestExecutionResult> {
    try {
      const { S3Client, ListBucketsCommand, GetBucketEncryptionCommand } = await import("@aws-sdk/client-s3");
      const client = this.createClient(S3Client);
      const buckets = await client.send(new ListBucketsCommand({}));
      const unencryptedBuckets: string[] = [];

      for (const bucket of buckets.Buckets || []) {
        try {
          await client.send(
            new GetBucketEncryptionCommand({ Bucket: bucket.Name! }),
          );
        } catch (err: any) {
          if (err.name === "ServerSideEncryptionConfigurationNotFoundError") {
            unencryptedBuckets.push(bucket.Name!);
          }
        }
      }

      const allowedBuckets = (testConfig.allowedUnencryptedBuckets as string[]) || [];
      const violatingBuckets = unencryptedBuckets.filter((b) => !allowedBuckets.includes(b));

      if (violatingBuckets.length === 0) {
        return {
          status: "pass",
          message: `All ${buckets.Buckets?.length || 0} S3 buckets have encryption enabled.`,
          details: { totalBuckets: buckets.Buckets?.length || 0, unencrypted: 0 },
        };
      }

      return {
        status: "fail",
        message: `${violatingBuckets.length} S3 bucket(s) lack encryption: ${violatingBuckets.join(", ")}`,
        details: { violatingBuckets, totalBuckets: buckets.Buckets?.length || 0 },
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "S3 encryption check failed",
      };
    }
  }

  private async checkIamMfa(_testConfig: Record<string, unknown>): Promise<TestExecutionResult> {
    try {
      const { IAMClient, ListUsersCommand, ListMFADevicesCommand } = await import("@aws-sdk/client-iam");
      const client = this.createClient(IAMClient);
      const users = await client.send(new ListUsersCommand({}));
      const usersWithoutMfa: string[] = [];

      for (const user of users.Users || []) {
        if (user.PasswordLastUsed) {
          const mfa = await client.send(new ListMFADevicesCommand({ UserName: user.UserName }));
          if ((mfa.MFADevices?.length || 0) === 0) {
            usersWithoutMfa.push(user.UserName!);
          }
        }
      }

      if (usersWithoutMfa.length === 0) {
        return {
          status: "pass",
          message: "All console users have MFA enabled.",
          details: { totalConsoleUsers: users.Users?.filter((u) => u.PasswordLastUsed).length || 0 },
        };
      }

      return {
        status: "fail",
        message: `${usersWithoutMfa.length} console user(s) without MFA: ${usersWithoutMfa.join(", ")}`,
        details: { usersWithoutMfa },
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "IAM MFA check failed",
      };
    }
  }

  private async checkCloudTrail(_testConfig: Record<string, unknown>): Promise<TestExecutionResult> {
    try {
      const { CloudTrailClient, DescribeTrailsCommand } = await import("@aws-sdk/client-cloudtrail");
      const client = this.createClient(CloudTrailClient);
      const trails = await client.send(new DescribeTrailsCommand({}));
      const activeTrails = (trails.trailList || []).filter((t) => t.IsMultiRegionTrail);

      if (activeTrails.length > 0) {
        return {
          status: "pass",
          message: `CloudTrail is enabled with ${activeTrails.length} multi-region trail(s).`,
          details: { trailNames: activeTrails.map((t) => t.Name) },
        };
      }

      return {
        status: "fail",
        message: "No active multi-region CloudTrail found.",
        details: { totalTrails: trails.trailList?.length || 0 },
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "CloudTrail check failed",
      };
    }
  }

  private async checkVpcFlowLogs(_testConfig: Record<string, unknown>): Promise<TestExecutionResult> {
    try {
      const { EC2Client, DescribeVpcsCommand, DescribeFlowLogsCommand } = await import("@aws-sdk/client-ec2");
      const client = this.createClient(EC2Client);
      const vpcs = await client.send(new DescribeVpcsCommand({}));
      const vpcIds = (vpcs.Vpcs || []).map((v) => v.VpcId!).filter(Boolean);

      if (vpcIds.length === 0) {
        return { status: "pass", message: "No VPCs found in this region.", details: { vpcCount: 0 } };
      }

      const flowLogs = await client.send(new DescribeFlowLogsCommand({}));
      const vpcsWithFlowLogs = new Set((flowLogs.FlowLogs || []).map((f) => f.ResourceId));
      const missingVpcs = vpcIds.filter((v) => !vpcsWithFlowLogs.has(v));

      if (missingVpcs.length === 0) {
        return {
          status: "pass",
          message: `All ${vpcIds.length} VPC(s) have flow logs enabled.`,
          details: { vpcCount: vpcIds.length },
        };
      }

      return {
        status: "fail",
        message: `${missingVpcs.length} VPC(s) missing flow logs: ${missingVpcs.join(", ")}`,
        details: { missingVpcs, vpcCount: vpcIds.length },
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "VPC flow logs check failed",
      };
    }
  }
}
